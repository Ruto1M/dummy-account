import request, { type Agent } from "supertest";
import { createApp } from "../app.js";
import { query } from "../db.js";
import { seedDatabase } from "../seed.js";

export const app = createApp();

const TABLES = [
  "fulfillment_events", "refunds", "webhook_events", "payment_events",
  "test_payment_sessions", "payments", "inventory_reservations",
  "order_addresses", "order_items", "orders", "quote_lines", "quotes",
  "promotion_redemptions", "consents", "cart_items", "carts",
  "recovery_tokens", "login_attempts", "sessions", "identities",
  "privacy_requests", "idempotency_keys", "outbox_emails", "audit_log",
  "policy_versions", "compliance_config", "shipping_rates", "shipping_zones",
  "tax_rules", "promotions", "skus", "products", "customers",
];

export async function resetDatabase(): Promise<void> {
  await query(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
  await seedDatabase();
}

export interface TestClient {
  agent: Agent;
  csrf: string;
  user: { id: string; email: string | null; isGuest: boolean };
  body: Record<string, unknown>;
}

export async function makeClient(): Promise<TestClient> {
  const agent = request.agent(app);
  const response = await agent.get("/api/bootstrap").expect(200);
  return {
    agent,
    csrf: response.body.user.csrfToken as string,
    user: response.body.user as TestClient["user"],
    body: response.body as Record<string, unknown>,
  };
}

export interface QuoteFixture {
  quote: Record<string, any>;
  promotion: Record<string, any> | null;
  address: Record<string, string>;
}

export const gbAddress = {
  line1: "123 Electric Avenue",
  line2: "",
  city: "London",
  postalCode: "SW1A 1AA",
  countryCode: "GB",
};

export async function setQuantity(client: TestClient, quantity: number): Promise<void> {
  await client.agent
    .put("/api/cart/quantity")
    .set("X-CSRF-Token", client.csrf)
    .send({ sku: "SONY-WH-1000", quantity })
    .expect(200);
}

export async function createQuoteFixture(
  client: TestClient,
  options: { address?: Record<string, string>; promotionCode?: string } = {},
): Promise<QuoteFixture> {
  const address = options.address ?? gbAddress;
  const response = await client.agent
    .post("/api/pricing/quote")
    .set("X-CSRF-Token", client.csrf)
    .send({
      address,
      shippingMethod: "standard",
      ...(options.promotionCode ? { promotionCode: options.promotionCode } : {}),
    })
    .expect(200);
  return {
    quote: response.body.quote,
    promotion: response.body.promotion,
    address: response.body.quote.address,
  };
}

export function orderPayload(quote: Record<string, any>, address: Record<string, string>) {
  return {
    quoteId: quote.id,
    quoteVersion: quote.version,
    quoteToken: quote.quoteToken,
    address,
    shippingMethod: quote.shippingMethod,
    consentNecessary: true,
    consentMarketing: false,
    consentVersion: "2026-11-26-draft",
  };
}
