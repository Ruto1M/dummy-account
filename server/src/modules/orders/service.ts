import type {
  ConsentRecord,
  CreateOrderRequest,
  Order,
  OrderItem,
  Receipt,
} from "@checkout/shared";
import { config } from "../../config.js";
import { pool, query, type Queryable } from "../../db.js";
import { errors } from "../../errors.js";
import { audit } from "../../logger.js";
import { randomToken } from "../../lib/security.js";
import type { SessionContext } from "../../lib/session.js";
import { getCompliance } from "../compliance/service.js";
import { getQuote } from "../pricing/service.js";
import { getCart, markCartOrdered } from "../cart/service.js";

interface OrderRow {
  id: string;
  number: string;
  status: Order["status"];
  payment_status: Order["paymentStatus"];
  fulfillment_status: Order["fulfillmentStatus"];
  currency: string;
  total_minor: number;
  created_at: Date;
  policy_version: string;
  paid_at: Date | null;
}

interface AddressRow {
  line1: string; line2: string; city: string; postal_code: string; country_code: string;
}

function sameAddress(a: Order["address"], b: Order["address"]): boolean {
  return a.line1 === b.line1 && a.line2 === b.line2 && a.city === b.city
    && a.postalCode === b.postalCode && a.countryCode === b.countryCode;
}

export function orderNumber(): string {
  return `ORD-${new Date().getUTCFullYear()}-${randomToken(5).replace(/[^A-Za-z0-9]/g, "A").toUpperCase().slice(0, 7)}`;
}

async function mapOrder(row: OrderRow, client: Queryable): Promise<Order> {
  const items = await query<{ sku: string; name: string; quantity: number; unit_price_minor: number; line_total_minor: number }>(
    "SELECT sku, name, quantity, unit_price_minor, line_total_minor FROM order_items WHERE order_id = $1 ORDER BY id",
    [row.id], client,
  );
  const address = await query<AddressRow>(
    "SELECT line1, line2, city, postal_code, country_code FROM order_addresses WHERE order_id = $1",
    [row.id], client,
  );
  const consents = await query<{ kind: string; version: string; granted: boolean; recorded_at: Date }>(
    "SELECT kind, version, granted, recorded_at FROM consents WHERE order_id = $1 ORDER BY id",
    [row.id], client,
  );
  const payment = await query<{
    provider_session_id: string; status: string; brand: string | null; last4: string | null; created_at: Date;
  }>(
    "SELECT provider_session_id, status, brand, last4, created_at FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1",
    [row.id], client,
  );
  const compliance = await getCompliance();
  const transaction = payment.rows[0];
  const paid = row.status === "paid" || row.status === "refunded" || row.status === "disputed";
  const receipt: Receipt | null = paid ? {
    merchant: compliance.sellerLegalEntity,
    orderNumber: row.number,
    transactionReference: transaction?.provider_session_id ?? null,
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    currency: row.currency.trim(),
    totalMinor: row.total_minor,
    paymentBrand: transaction?.brand ?? null,
    last4: transaction?.last4 ?? null,
    policyVersion: row.policy_version,
  } : null;
  const addressRow = address.rows[0];

  return {
    id: row.id,
    number: row.number,
    status: row.status,
    paymentStatus: row.payment_status,
    fulfillmentStatus: row.fulfillment_status,
    currency: row.currency.trim(),
    totalMinor: row.total_minor,
    createdAt: new Date(row.created_at).toISOString(),
    confirmationUrl: `${config.publicWebOrigin}/?order=${row.id}`,
    items: items.rows.map((item) => ({
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      unitPriceMinor: item.unit_price_minor,
      lineTotalMinor: item.line_total_minor,
    })) as OrderItem[],
    address: addressRow ? {
      line1: addressRow.line1,
      line2: addressRow.line2,
      city: addressRow.city,
      postalCode: addressRow.postal_code,
      countryCode: addressRow.country_code,
    } : { line1: "", line2: "", city: "", postalCode: "", countryCode: "" },
    consents: (() => {
      const necessary = consents.rows.find((row) => row.kind === "necessary");
      if (!necessary) return [];
      const marketing = consents.rows.find((row) => row.kind === "marketing");
      const record: ConsentRecord = {
        necessary: true,
        marketing: marketing?.granted ?? false,
        version: necessary.version,
        recordedAt: new Date(necessary.recorded_at).toISOString(),
      };
      return [record];
    })(),
    receipt,
    message: null,
  };
}

export async function createOrder(
  input: CreateOrderRequest,
  session: SessionContext,
  client: Queryable,
): Promise<Order> {
  const quote = await getQuote(input.quoteId, input.quoteToken, session, client);
  if (quote.version !== input.quoteVersion) throw errors.quoteExpired();
  if (quote.shippingMethod !== input.shippingMethod) throw errors.validation("Shipping method changed. Review your total.", "shippingMethod");
  if (!sameAddress(quote.address, input.address)) {
    throw errors.validation("Address changed. Review your total.", "address");
  }
  const cart = await getCart(session.customerId, client);
  const cartItem = cart.items[0];
  if (!cartItem || cartItem.sku !== quote.sku || cartItem.quantity !== quote.quantity) {
    throw errors.validation("Your cart changed. Review your total.", "quantity");
  }
  const compliance = await getCompliance();
  if (compliance.providerMode === "test" && !config.checkoutTestMode) throw errors.launchGateBlocked();

  const stock = await query<{ id: string; stock: number }>(
    "SELECT id, stock FROM skus WHERE sku = $1 FOR UPDATE", [quote.sku], client,
  );
  const sku = stock.rows[0];
  if (!sku || sku.stock < quote.quantity) throw errors.inventoryChanged();
  const reserved = await query(
    `UPDATE skus SET stock = stock - $2 WHERE id = $1 AND stock >= $2 RETURNING id`,
    [sku.id, quote.quantity], client,
  );
  if (!reserved.rowCount) throw errors.inventoryChanged();

  const row = await query<OrderRow>(
    `INSERT INTO orders (
       number, customer_id, quote_id, status, payment_status, fulfillment_status,
       currency, subtotal_minor, discount_minor, tax_minor, shipping_minor, total_minor,
       promotion_code, shipping_method, policy_version, message)
     VALUES ($1,$2,$3,'awaiting_payment','pending','unfulfilled',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      orderNumber(), session.customerId, quote.id, quote.currency,
      quote.subtotalMinor, quote.discountMinor, quote.taxMinor, quote.shippingMinor,
      quote.totalMinor, quote.promotionCode, quote.shippingMethod, compliance.policyVersion,
      config.providerMode === "test" ? "Test checkout — no live payment is taken." : null,
    ], client,
  );
  const order = row.rows[0]!;

  const lineTotal = quote.unitPriceMinor * quote.quantity;
  await query(
    `INSERT INTO order_items (order_id, sku, name, quantity, unit_price_minor, line_total_minor)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [order.id, quote.sku, `Sony wireless headphones`, quote.quantity, quote.unitPriceMinor, lineTotal], client,
  );
  await query(
    `INSERT INTO order_addresses (order_id, line1, line2, city, postal_code, country_code)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [order.id, quote.address.line1, quote.address.line2, quote.address.city, quote.address.postalCode, quote.address.countryCode], client,
  );
  await query(
    `INSERT INTO consents (customer_id, order_id, kind, version, granted)
     VALUES ($1,$2,'necessary',$3,true), ($1,$2,'marketing',$3,$4)`,
    [session.customerId, order.id, input.consentVersion, input.consentMarketing], client,
  );
  if (quote.promotionCode) {
    const promotion = await query<{ id: string }>(
      "SELECT id FROM promotions WHERE upper(code) = upper($1)", [quote.promotionCode], client,
    );
    if (promotion.rows[0]) {
      await query(
        "INSERT INTO promotion_redemptions (promotion_id, order_id, customer_id) VALUES ($1,$2,$3)",
        [promotion.rows[0].id, order.id, session.customerId], client,
      );
    }
  }
  await query(
    `INSERT INTO inventory_reservations (sku_id, order_id, quantity, expires_at)
     VALUES ($1,$2,$3, now() + ($4 || ' minutes')::interval)`,
    [sku.id, order.id, quote.quantity, String(config.reservationTtlMinutes)], client,
  );
  await markCartOrdered(quote.cartId, client);
  audit("order_created", {
    customerId: session.customerId, orderId: order.id, amountMinor: quote.totalMinor,
    correlationId: order.number,
  });

  return mapOrder(order, client);
}

export async function getOrder(orderId: string, session: SessionContext): Promise<Order> {
  const result = await query<OrderRow>(
    "SELECT * FROM orders WHERE id = $1 AND customer_id = $2",
    [orderId, session.customerId],
  );
  const row = result.rows[0];
  if (!row) throw errors.notFound("Order not found.");
  return mapOrder(row, pool);
}

export async function markOrderPaid(
  orderId: string,
  client: Queryable,
  paidAt: Date,
): Promise<void> {
  await query(
    `UPDATE orders SET status = 'paid', payment_status = 'paid', paid_at = $2, updated_at = now()
      WHERE id = $1 AND status IN ('awaiting_payment','failed')`,
    [orderId, paidAt], client,
  );
}

export async function markOrderFailed(orderId: string, client: Queryable, status: "failed" | "canceled" | "disputed" | "refunded"): Promise<void> {
  await query(
    `UPDATE orders SET status = $2, payment_status = $2, updated_at = now()
      WHERE id = $1 AND status NOT IN ('paid','refunded')`,
    [orderId, status], client,
  );
  if (status === "canceled" || status === "failed") {
    await query(
      `UPDATE skus SET stock = stock + r.quantity
         FROM inventory_reservations r
        WHERE r.order_id = $1 AND r.sku_id = skus.id AND r.released_at IS NULL`,
      [orderId], client,
    );
    await query(
      "UPDATE inventory_reservations SET released_at = now() WHERE order_id = $1 AND released_at IS NULL",
      [orderId], client,
    );
  }
}
