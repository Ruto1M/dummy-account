import type { Address, ComplianceConfig, ShippingMethod, ShippingOption } from "@checkout/shared";
import { pool, query, type Queryable } from "../../db.js";
import { errors } from "../../errors.js";

interface RateRow {
  method: ShippingMethod;
  label: string;
  price_minor: number;
  currency: string;
  eta_min_days: number;
  eta_max_days: number;
}

export function normalizeAddress(input: Address): Address {
  return {
    line1: input.line1.trim(),
    line2: input.line2.trim(),
    city: input.city.trim(),
    postalCode: input.postalCode.trim().toUpperCase(),
    countryCode: input.countryCode.trim().toUpperCase(),
  };
}

export function validateAddress(input: Address, compliance: ComplianceConfig): Address {
  const address = normalizeAddress(input);
  if (!compliance.supportedCountries.includes(address.countryCode)) {
    throw errors.validation("We do not currently ship to that country.", "countryCode");
  }
  if (!/^[A-Z0-9][A-Z0-9 -]{1,18}$/.test(address.postalCode)) {
    throw errors.validation("Enter a valid postal code.", "postalCode");
  }
  return address;
}

export async function getShippingOptions(
  destination: Pick<Address, "countryCode">,
  client: Queryable = pool,
): Promise<ShippingOption[]> {
  const rows = await query<RateRow>(
    `SELECT r.method, r.label, r.price_minor, r.currency, r.eta_min_days, r.eta_max_days
       FROM shipping_rates r
       JOIN shipping_zones z ON z.id = r.zone_id
      WHERE z.country_code = $1 AND z.active AND r.active
      ORDER BY r.price_minor`,
    [destination.countryCode.trim().toUpperCase()],
    client,
  );
  return rows.rows.map((row) => ({
    method: row.method,
    label: row.label,
    priceMinor: row.price_minor,
    currency: row.currency.trim(),
    etaMinDays: row.eta_min_days,
    etaMaxDays: row.eta_max_days,
    available: true,
  }));
}

export async function getRate(
  address: Address,
  method: ShippingMethod,
  client: Queryable,
): Promise<{ priceMinor: number; currency: string; etaMinDays: number; etaMaxDays: number }> {
  const options = await getShippingOptions(address, client);
  const option = options.find((item) => item.method === method);
  if (!option) throw errors.validation("That shipping method is not available for this destination.", "shippingMethod");
  return {
    priceMinor: option.priceMinor,
    currency: option.currency,
    etaMinDays: option.etaMinDays,
    etaMaxDays: option.etaMaxDays,
  };
}
