import type {
  Address,
  CreateQuoteRequest,
  PromotionResult,
  Quote,
  QuoteLine,
  ShippingMethod,
} from "@checkout/shared";
import { config } from "../../config.js";
import { pool, query, withTransaction, type Queryable } from "../../db.js";
import { errors } from "../../errors.js";
import { audit } from "../../logger.js";
import { randomToken, tokenHash } from "../../lib/security.js";
import type { SessionContext } from "../../lib/session.js";
import { getCompliance } from "../compliance/service.js";
import { getSku } from "../catalog/service.js";
import { getCart } from "../cart/service.js";
import { getRate, validateAddress } from "../shipping/service.js";

export const ROUNDING_RULE = "HALF_UP_PER_LINE_MINOR_UNITS";

interface QuoteRow {
  id: string;
  cart_id: string;
  version: number;
  expires_at: Date;
  currency: string;
  tax_inclusive: boolean;
  rounding_rule: string;
  sku: string;
  quantity: number;
  unit_price_minor: number;
  availability: Quote["availability"];
  subtotal_minor: number;
  discount_minor: number;
  tax_minor: number;
  shipping_minor: number;
  total_minor: number;
  promotion_code: string | null;
  shipping_method: ShippingMethod;
  address: Address;
}

interface PromotionRow {
  id: string;
  kind: "percent" | "flat";
  value_bps: number | null;
  value_minor: number | null;
  min_subtotal_minor: number;
  max_discount_minor: number | null;
  usage_limit: number | null;
  ends_at: Date | null;
  description: string;
}

/** Non-negative integer rounding, half away from zero, at each line. */
export function roundHalfUp(numerator: number, denominator: number): number {
  if (denominator <= 0) throw new Error("Invalid denominator");
  return Math.floor((numerator + denominator / 2) / denominator);
}

async function mapQuote(row: QuoteRow, token: string, client: Queryable): Promise<Quote> {
  const lines = await query<{ kind: QuoteLine["kind"]; label: string; amount_minor: number }>(
    "SELECT kind, label, amount_minor FROM quote_lines WHERE quote_id = $1 ORDER BY position",
    [row.id], client,
  );
  return {
    id: row.id,
    cartId: row.cart_id,
    version: row.version,
    expiresAt: new Date(row.expires_at).toISOString(),
    currency: row.currency.trim(),
    taxInclusive: row.tax_inclusive,
    roundingRule: row.rounding_rule,
    sku: row.sku,
    quantity: row.quantity,
    unitPriceMinor: row.unit_price_minor,
    availability: row.availability,
    discountMinor: row.discount_minor,
    promotionCode: row.promotion_code,
    taxMinor: row.tax_minor,
    shippingMinor: row.shipping_minor,
    shippingMethod: row.shipping_method,
    subtotalMinor: row.subtotal_minor,
    totalMinor: row.total_minor,
    lines: lines.rows.map((line) => ({
      kind: line.kind,
      label: line.label,
      amountMinor: line.amount_minor,
    })),
    address: row.address,
    quoteToken: token,
  };
}

async function computeDiscount(
  code: string | undefined,
  subtotalMinor: number,
  client: Queryable,
): Promise<{ discountMinor: number; promotion: PromotionResult | null }> {
  if (!code) return { discountMinor: 0, promotion: null };
  const result = await query<PromotionRow>(
    `SELECT id, kind, value_bps, value_minor, min_subtotal_minor, max_discount_minor,
            usage_limit, ends_at, description
       FROM promotions WHERE upper(code) = upper($1) AND active AND starts_at <= now()
        AND (ends_at IS NULL OR ends_at > now())`,
    [code],
    client,
  );
  const promotion = result.rows[0];
  if (!promotion || subtotalMinor < promotion.min_subtotal_minor) {
    return {
      discountMinor: 0,
      promotion: { code, valid: false, description: "That code is not valid for this order.", discountMinor: 0 },
    };
  }
  if (promotion.usage_limit !== null) {
    const usage = await query<{ count: string }>(
      "SELECT count(*)::text AS count FROM promotion_redemptions WHERE promotion_id = $1",
      [promotion.id], client,
    );
    if (Number(usage.rows[0]?.count ?? 0) >= promotion.usage_limit) {
      return {
        discountMinor: 0,
        promotion: { code, valid: false, description: "That code has reached its usage limit.", discountMinor: 0 },
      };
    }
  }
  let discount = promotion.kind === "percent"
    ? roundHalfUp(subtotalMinor * (promotion.value_bps ?? 0), 10_000)
    : (promotion.value_minor ?? 0);
  if (promotion.max_discount_minor !== null) discount = Math.min(discount, promotion.max_discount_minor);
  discount = Math.min(discount, subtotalMinor);
  return {
    discountMinor: discount,
    promotion: { code: code.toUpperCase(), valid: true, description: promotion.description, discountMinor: discount },
  };
}

async function computeTax(
  countryCode: string,
  taxableMinor: number,
  quantity: number,
  taxInclusive: boolean,
  client: Queryable,
): Promise<number> {
  const result = await query<{
    kind: "flat_per_unit" | "percent"; rate_bps: number | null; amount_minor: number | null;
  }>(
    `SELECT kind, rate_bps, amount_minor FROM tax_rules
      WHERE country_code = $1 AND active AND valid_from <= now()
      ORDER BY valid_from DESC LIMIT 1`,
    [countryCode], client,
  );
  const rule = result.rows[0];
  if (!rule) throw errors.validation("Tax rules are not configured for that destination.", "countryCode");
  if (rule.kind === "flat_per_unit") return (rule.amount_minor ?? 0) * quantity;
  const bps = rule.rate_bps ?? 0;
  if (!taxInclusive) return roundHalfUp(taxableMinor * bps, 10_000);
  return roundHalfUp(taxableMinor * bps, 10_000 + bps);
}

export async function createQuote(
  session: SessionContext,
  input: CreateQuoteRequest,
): Promise<{ quote: Quote; promotion: PromotionResult | null }> {
  return withTransaction(async (client) => {
    const compliance = await getCompliance();
    const address = validateAddress(input.address, compliance);
    const cart = await getCart(session.customerId, client);
    const item = cart.items[0];
    if (!item) throw errors.validation("Your cart is empty.", "quantity");
    if (!compliance.currencies.includes(cart.currency)) {
      throw errors.validation("That currency is not configured for checkout.", "currency");
    }
    const sku = await getSku(item.sku, client, true);
    if (!sku.active || sku.stock < item.quantity) throw errors.inventoryChanged();
    if (sku.currency !== cart.currency) {
      throw errors.validation("The product currency does not match your cart.", "currency");
    }

    const shipping = await getRate(address, input.shippingMethod, client);
    if (shipping.currency !== cart.currency) {
      throw errors.validation("Shipping is not available in your cart currency.", "currency");
    }
    const subtotal = item.quantity * sku.unit_price_minor;
    const { discountMinor, promotion } = await computeDiscount(input.promotionCode, subtotal, client);
    const taxable = subtotal - discountMinor;
    const taxMinor = await computeTax(
      address.countryCode, taxable, item.quantity, compliance.taxInclusive, client,
    );
    const totalMinor = compliance.taxInclusive
      ? taxable + shipping.priceMinor
      : taxable + taxMinor + shipping.priceMinor;

    const token = randomToken(24);
    const inserted = await query<QuoteRow>(
      `INSERT INTO quotes (
         cart_id, customer_id, token_hash, address, shipping_method, currency, tax_inclusive,
         rounding_rule, sku, quantity, unit_price_minor, availability,
         subtotal_minor, discount_minor, tax_minor, shipping_minor, total_minor,
         promotion_code, expires_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
         now() + ($19 || ' minutes')::interval)
       RETURNING *`,
      [
        cart.id, session.customerId, tokenHash(token), JSON.stringify(address), input.shippingMethod,
        cart.currency, compliance.taxInclusive, ROUNDING_RULE, sku.sku, item.quantity,
        sku.unit_price_minor, sku.stock <= sku.low_stock_threshold ? "low_stock" : "in_stock",
        subtotal, discountMinor, taxMinor, shipping.priceMinor, totalMinor,
        input.promotionCode?.toUpperCase() ?? null,
        String(config.quoteTtlMinutes),
      ], client,
    );
    const row = inserted.rows[0]!;

    const lines: Array<[QuoteLine["kind"], string, number]> = [
      ["subtotal", "Sub total", subtotal],
      ["discount", `Discount${discountMinor ? "" : " (none)"}`, -discountMinor],
      ["tax", compliance.taxInclusive ? "Tax (included)" : "Tax", taxMinor],
      ["shipping", shipping.priceMinor === 0 ? "Free delivery" : "Shipping", shipping.priceMinor],
      ["total", "Total", totalMinor],
    ];
    for (const [index, [kind, label, amount]] of lines.entries()) {
      await query(
        "INSERT INTO quote_lines (quote_id, kind, label, amount_minor, position) VALUES ($1,$2,$3,$4,$5)",
        [row.id, kind, label, amount, index], client,
      );
    }
    audit("quote_created", { customerId: session.customerId, orderId: row.id, amountMinor: totalMinor });
    return { quote: await mapQuote(row, token, client), promotion };
  });
}

export async function getQuote(
  quoteId: string,
  token: string,
  session: SessionContext,
  client: Queryable = pool,
): Promise<Quote> {
  const result = await query<QuoteRow>(
    `SELECT * FROM quotes WHERE id = $1 AND customer_id = $2
       AND token_hash = $3 AND expires_at > now()`,
    [quoteId, session.customerId, tokenHash(token)], client,
  );
  const row = result.rows[0];
  if (!row) throw errors.quoteExpired();
  return mapQuote(row, token, client);
}

export async function getQuoteForOrder(
  quoteId: string,
  session: SessionContext,
  client: Queryable,
): Promise<QuoteRow> {
  const result = await query<QuoteRow>(
    "SELECT * FROM quotes WHERE id = $1 AND customer_id = $2 ORDER BY version DESC LIMIT 1",
    [quoteId, session.customerId], client,
  );
  const row = result.rows[0];
  if (!row) throw errors.notFound("Quote not found.");
  return row;
}
