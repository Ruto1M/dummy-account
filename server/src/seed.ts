import { query, withTransaction } from "./db.js";

export const POLICY_VERSION = "2026-11-26-draft";

const policyDocument = {
  terms: "DRAFT — Terms of sale require qualified legal review before publication.",
  privacy: "DRAFT — Privacy notice requires qualified legal review before publication.",
  delivery: "DRAFT — Delivery terms require review before publication.",
  returns: "DRAFT — Return conditions require review before publication.",
  refund: "DRAFT — Refund timing and method require review before publication.",
};

export const complianceDocument = {
  sellerLegalEntity: "DUMMY ACCOUNT (placeholder — replace before launch)",
  supportedCountries: ["GB", "US", "DE", "FR"],
  currencies: ["GBP"],
  b2bMode: false,
  taxInclusive: false,
  policies: {
    terms: "/policies/terms",
    privacy: "/policies/privacy",
    delivery: "/policies/delivery",
    returns: "/policies/returns",
    refund: "/policies/refund",
  },
  policyVersion: POLICY_VERSION,
  privacyController: "DUMMY ACCOUNT (placeholder controller)",
  privacyContact: "privacy@example.invalid",
  retention: { ordersMonths: 84, sessionsDays: 30, analyticsDays: 90 },
  restrictions: { minimumAge: 18, restrictedCategories: [] },
  cookies: [
    { name: "checkout_session", purpose: "Necessary — signed session", necessary: true, retentionDays: 30 },
    { name: "checkout_csrf", purpose: "Necessary — CSRF double-submit", necessary: true, retentionDays: 30 },
    { name: "analytics_optional", purpose: "Optional analytics (disabled)", necessary: false, retentionDays: 90 },
  ],
  paymentMethods: ["card", "paypal"],
  providerMode: "test",
  liveCheckoutEnabled: false,
  reviewedAt: null,
  reviewedBy: null,
};

export async function seedDatabase(): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO compliance_config (singleton, document)
       VALUES (true, $1::jsonb)
       ON CONFLICT (singleton) DO UPDATE SET document = EXCLUDED.document, updated_at = now()`,
      [JSON.stringify(complianceDocument)],
    );

    await client.query(
      `INSERT INTO policy_versions (version, document, reviewed_by)
       VALUES ($1, $2::jsonb, 'UNREVIEWED')
       ON CONFLICT (version) DO NOTHING`,
      [POLICY_VERSION, JSON.stringify(policyDocument)],
    );

    const product = await client.query<{ id: string }>(
      `INSERT INTO products (sku, name, description, image_url)
       VALUES ('SONY-WH-1000', 'Sony wireless headphones',
               'Wireless over-ear headphones with noise cancellation.', '/headphones.jpg')
       ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
         image_url = EXCLUDED.image_url, active = true
       RETURNING id`,
    );
    const productId = product.rows[0]!.id;

    await client.query(
      `INSERT INTO skus (product_id, sku, currency, unit_price_minor, stock, low_stock_threshold, max_quantity)
       VALUES ($1, 'SONY-WH-1000', 'GBP', 31655, 50, 3, 10)
       ON CONFLICT (sku) DO UPDATE SET
         product_id = EXCLUDED.product_id,
         currency = EXCLUDED.currency,
         unit_price_minor = EXCLUDED.unit_price_minor,
         max_quantity = EXCLUDED.max_quantity`,
      [productId],
    );

    await client.query(
      `INSERT INTO promotions (code, kind, value_bps, currency, min_subtotal_minor, description)
       VALUES ('SAVE10', 'percent', 1000, 'GBP', 0, '10% off the subtotal (test promotion).')
       ON CONFLICT (code) DO UPDATE SET value_bps = 1000, active = true`,
    );

    await client.query(
      `INSERT INTO tax_rules (country_code, kind, amount_minor, currency, inclusive)
       SELECT 'GB', 'flat_per_unit', 345, 'GBP', false
       WHERE NOT EXISTS (SELECT 1 FROM tax_rules WHERE country_code = 'GB' AND active)`,
    );
    for (const code of ["US", "DE", "FR"]) {
      await client.query(
        `INSERT INTO tax_rules (country_code, kind, rate_bps, currency, inclusive)
         SELECT $1, 'percent', 2000, 'GBP', false
         WHERE NOT EXISTS (SELECT 1 FROM tax_rules WHERE country_code = $1 AND active)`,
        [code],
      );
    }

    const labels: Record<string, string> = {
      GB: "United Kingdom", US: "United States", DE: "Germany", FR: "France",
    };
    for (const code of ["GB", "US", "DE", "FR"]) {
      const zone = await client.query<{ id: string }>(
        `INSERT INTO shipping_zones (country_code, label) VALUES ($1, $2)
         ON CONFLICT (country_code) DO UPDATE SET label = EXCLUDED.label, active = true
         RETURNING id`,
        [code, labels[code]],
      );
      const zoneId = zone.rows[0]!.id;
      const rates = [
        ["standard", "Free delivery", 0, 3, 5],
        ["express", "Express shipping", 1250, 1, 2],
        ["overnight", "Overnight shipping", 2500, 0, 1],
      ] as const;
      for (const [method, label, price, min, max] of rates) {
        await client.query(
          `INSERT INTO shipping_rates (zone_id, method, label, price_minor, currency, eta_min_days, eta_max_days)
           VALUES ($1, $2, $3, $4, 'GBP', $5, $6)
           ON CONFLICT (zone_id, method) DO UPDATE SET
             label = EXCLUDED.label, price_minor = EXCLUDED.price_minor,
             eta_min_days = EXCLUDED.eta_min_days, eta_max_days = EXCLUDED.eta_max_days, active = true`,
          [zoneId, method, label, price, min, max],
        );
      }
    }
  });
  await query("SELECT 1");
}
