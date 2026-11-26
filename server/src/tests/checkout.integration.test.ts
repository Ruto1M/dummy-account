import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "./helpers.js";
import { query, closeDatabase } from "../db.js";
import { roundHalfUp } from "../modules/pricing/service.js";
import { reconcilePending } from "../modules/payment/service.js";
import { signTestWebhook } from "../modules/payment/test-provider.js";
import {
  createQuoteFixture,
  gbAddress,
  makeClient,
  orderPayload,
  resetDatabase,
  setQuantity,
  type TestClient,
} from "./helpers.js";

let keyCounter = 0;
const key = (prefix: string) => `${prefix}_${Date.now()}_${keyCounter++}`;

beforeEach(async () => {
  keyCounter = 0;
  await resetDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

async function createPendingOrder(client: TestClient, quantity = 1) {
  await setQuantity(client, quantity);
  const quote = await createQuoteFixture(client);
  const order = await client.agent
    .post("/api/orders")
    .set("X-CSRF-Token", client.csrf)
    .set("Idempotency-Key", key("order"))
    .send(orderPayload(quote.quote, quote.address))
    .expect(201);
  const payment = await client.agent
    .post("/api/payment/sessions")
    .set("X-CSRF-Token", client.csrf)
    .set("Idempotency-Key", key("payment"))
    .send({ orderId: order.body.id, method: "card" })
    .expect(201);
  return {
    order: order.body as Record<string, any>,
    payment: payment.body as Record<string, any>,
    sessionId: new URL(payment.body.checkoutUrl).searchParams.get("session")!,
  };
}

function signedWebhook(body: unknown, timestamp = Math.floor(Date.now() / 1000)) {
  const raw = JSON.stringify(body);
  return { raw, signature: signTestWebhook(timestamp, raw) };
}

async function webhookEvent(
  sessionId: string,
  status: "paid" | "failed" | "canceled",
  id = `evt_${Math.random().toString(36).slice(2)}`,
) {
  return {
    id,
    type: status === "paid" ? "payment.succeeded" : `payment.${status}`,
    data: {
      sessionId,
      status,
      brand: status === "paid" ? "Test Card" : null,
      last4: status === "paid" ? "4242" : null,
      occurredAt: new Date().toISOString(),
    },
  };
}

describe("identity and authorization", () => {
  it("creates a guest session with HttpOnly SameSite cookies and a cart", async () => {
    const client = await makeClient();
    const compliance = client.body.compliance as {
      liveCheckoutEnabled: boolean;
      launchGates: Array<{ status: string }>;
    };
    const cart = client.body.cart as { items: Array<{ sku: string }> };
    expect(client.user.isGuest).toBe(true);
    expect(cart.items[0].sku).toBe("SONY-WH-1000");
    // Cookies are issued at bootstrap (session creation), not on later session reads.
    const cookies = await request(app).get("/api/bootstrap").expect(200);
    const setCookie = String(cookies.headers["set-cookie"] ?? "");
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(compliance.liveCheckoutEnabled).toBe(false);
    expect(compliance.launchGates.some((gate) => gate.status !== "verified")).toBe(true);
  });

  it("registers, keeps the guest cart, and never stores a plaintext password", async () => {
    const client = await makeClient();
    await setQuantity(client, 2);
    const response = await client.agent
      .post("/api/identity/register")
      .set("X-CSRF-Token", client.csrf)
      .send({ email: "Buyer@Example.com", password: "correct-horse-battery-staple" })
      .expect(201);
    expect(response.body.user.email).toBe("buyer@example.com");
    expect(response.body.user.isGuest).toBe(false);
    const cart = await client.agent.get("/api/cart").expect(200);
    expect(cart.body.cart.items[0].quantity).toBe(2);
    const stored = await query<{ password_hash: string }>(
      "SELECT password_hash FROM identities JOIN customers ON customers.id = identities.customer_id WHERE lower(customers.email) = $1",
      ["buyer@example.com"],
    );
    expect(stored.rows[0]!.password_hash).not.toContain("correct-horse");
    expect(stored.rows[0]!.password_hash).toMatch(/^scrypt\$/);
  });

  it("starts a fresh cart on bootstrap after an order closes the previous one", async () => {
    const client = await makeClient();
    await createPendingOrder(client);
    const cart = await client.agent.get("/api/bootstrap").expect(200);
    expect(cart.body.cart.items).toHaveLength(1);
    expect(cart.body.cart.items[0].sku).toBe("SONY-WH-1000");
    expect(cart.body.quote).not.toBeNull();
  });

  it("seeds a usable cart when registering after the guest cart was ordered", async () => {
    const client = await makeClient();
    await createPendingOrder(client);
    await client.agent
      .post("/api/identity/register")
      .set("X-CSRF-Token", client.csrf)
      .send({ email: "newbuyer@example.com", password: "correct-horse-battery-staple" })
      .expect(201);
    const cart = await client.agent.get("/api/cart").expect(200);
    expect(cart.body.cart.items).toHaveLength(1);
    expect(cart.body.cart.items[0].sku).toBe("SONY-WH-1000");
  });

  it("uses generic login errors and throttles repeated failures", async () => {
    const client = await makeClient();
    const response = await client.agent
      .post("/api/identity/register")
      .set("X-CSRF-Token", client.csrf)
      .send({ email: "buyer@example.com", password: "correct-horse-battery-staple" })
      .expect(201);
    // Registration rotates the session; the browser reads the new CSRF token from this response.
    client.csrf = response.body.user.csrfToken as string;
    const unknown = await client.agent
      .post("/api/identity/login")
      .set("X-CSRF-Token", client.csrf)
      .send({ email: "nobody@example.com", password: "wrong-password-long" });
    const wrong = await client.agent
      .post("/api/identity/login")
      .set("X-CSRF-Token", client.csrf)
      .send({ email: "buyer@example.com", password: "wrong-password-long" });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.message).toBe(wrong.body.message);

    // Use a non-existent address so this exercises the global per-email attempt
    // counter rather than the separate per-account lockout (which also returns a generic 401).
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await client.agent
        .post("/api/identity/login")
        .set("X-CSRF-Token", client.csrf)
        .send({ email: "nobody@example.com", password: "wrong-password-long" });
    }
    const throttled = await client.agent
      .post("/api/identity/login")
      .set("X-CSRF-Token", client.csrf)
      .send({ email: "nobody@example.com", password: "wrong-password-long" });
    expect(throttled.status).toBe(429);
    expect(throttled.body.code).toBe("RATE_LIMITED");
  });

  it("denies cross-customer order access with 404", async () => {
    const owner = await makeClient();
    const stranger = await makeClient();
    const { order } = await createPendingOrder(owner);
    const response = await stranger.agent.get(`/api/orders/${order.id}`);
    expect(response.status).toBe(404);
    expect(response.body.code).toBe("NOT_FOUND");
  });
});

describe("server-authoritative pricing", () => {
  it("rounds half away from zero at each line and applies tax/promotion from config", async () => {
    expect(roundHalfUp(5, 2)).toBe(3);
    expect(roundHalfUp(1, 2)).toBe(1);
    expect(roundHalfUp(100, 3)).toBe(33);
    expect(roundHalfUp(31655 * 1000, 10000)).toBe(3166);

    const client = await makeClient();
    const quote = await createQuoteFixture(client, { promotionCode: "SAVE10" });
    expect(quote.quote.currency).toBe("GBP");
    expect(quote.quote.subtotalMinor).toBe(31655);
    expect(quote.quote.discountMinor).toBe(3166);
    expect(quote.quote.taxMinor).toBe(345);
    expect(quote.quote.totalMinor).toBe(28834);
    expect(Date.parse(quote.quote.expiresAt)).toBeGreaterThan(Date.now());
    expect(Number.isInteger(quote.quote.totalMinor)).toBe(true);
  });

  it("uses destination-specific rules for a different jurisdiction", async () => {
    const client = await makeClient();
    const quote = await createQuoteFixture(client, {
      address: { ...gbAddress, city: "Berlin", postalCode: "10115", countryCode: "DE" },
    });
    expect(quote.quote.taxMinor).toBe(6331);
    expect(quote.quote.totalMinor).toBe(37986);
    expect(quote.quote.currency).toBe("GBP");
  });

  it("fails closed when a supported currency is not configured", async () => {
    const client = await makeClient();
    const compliance = await query("SELECT document FROM compliance_config WHERE singleton = true");
    await query(
      "UPDATE compliance_config SET document = $1::jsonb WHERE singleton = true",
      [JSON.stringify({ ...compliance.rows[0]!.document, currencies: ["USD"] })],
    );
    const response = await client.agent
      .post("/api/pricing/quote")
      .set("X-CSRF-Token", client.csrf)
      .send({ address: gbAddress, shippingMethod: "standard" });
    expect(response.status).toBe(422);
    expect(response.body.field).toBe("currency");
  });

  it("rejects a stale quote when the cart changes or token is wrong", async () => {
    const client = await makeClient();
    const quote = await createQuoteFixture(client);
    await setQuantity(client, 3);
    const changed = await client.agent
      .post("/api/orders")
      .set("X-CSRF-Token", client.csrf)
      .set("Idempotency-Key", key("order"))
      .send(orderPayload(quote.quote, quote.address));
    expect(changed.status).toBe(422);
    expect(changed.body.field).toBe("quantity");

    const wrongToken = await client.agent
      .post("/api/orders")
      .set("X-CSRF-Token", client.csrf)
      .set("Idempotency-Key", key("order"))
      .send({ ...orderPayload(quote.quote, quote.address), quoteToken: "not-the-token" });
    expect(wrongToken.status).toBe(409);
    expect(wrongToken.body.code).toBe("QUOTE_EXPIRED");
  });
});

describe("idempotency and inventory", () => {
  it("replays duplicate requests and rejects a reused key with a different body", async () => {
    const client = await makeClient();
    const quote = await createQuoteFixture(client);
    const payload = orderPayload(quote.quote, quote.address);
    const idempotencyKey = key("order");
    const first = await client.agent
      .post("/api/orders")
      .set("X-CSRF-Token", client.csrf)
      .set("Idempotency-Key", idempotencyKey)
      .send(payload)
      .expect(201);
    const replay = await client.agent
      .post("/api/orders")
      .set("X-CSRF-Token", client.csrf)
      .set("Idempotency-Key", idempotencyKey)
      .send(payload)
      .expect(200);
    expect(replay.body.id).toBe(first.body.id);
    const count = await query("SELECT count(*)::int AS count FROM orders");
    expect(count.rows[0]!.count).toBe(1);

    const conflict = await client.agent
      .post("/api/orders")
      .set("X-CSRF-Token", client.csrf)
      .set("Idempotency-Key", idempotencyKey)
      .send({ ...payload, consentMarketing: true });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("allows only one order when two customers race for the last unit", async () => {
    await query("UPDATE skus SET stock = 1 WHERE sku = 'SONY-WH-1000'");
    const a = await makeClient();
    const b = await makeClient();
    const qa = await createQuoteFixture(a);
    const qb = await createQuoteFixture(b);
    const results = await Promise.all([
      a.agent.post("/api/orders").set("X-CSRF-Token", a.csrf).set("Idempotency-Key", key("order")).send(orderPayload(qa.quote, qa.address)),
      b.agent.post("/api/orders").set("X-CSRF-Token", b.csrf).set("Idempotency-Key", key("order")).send(orderPayload(qb.quote, qb.address)),
    ]);
    expect(results.filter((result) => result.status === 201)).toHaveLength(1);
    expect(results.filter((result) => result.body.code === "INVENTORY_CHANGED")).toHaveLength(1);
    const stock = await query("SELECT stock FROM skus WHERE sku = 'SONY-WH-1000'");
    expect(stock.rows[0]!.stock).toBe(0);
  });
});

describe("payment events, refunds and reconciliation", () => {
  it("rejects invalid, stale and forged webhook signatures", async () => {
    const { sessionId } = await createPendingOrder(await makeClient());
    const event = await webhookEvent(sessionId, "paid");
    const forged = signedWebhook(event);
    const bad = await requestWebhook(forged.raw, "t=1,v1=" + "0".repeat(64));
    expect(bad.status).toBe(422);
    const stale = signedWebhook(event, Math.floor(Date.now() / 1000) - 3600);
    const old = await requestWebhook(stale.raw, stale.signature);
    expect(old.status).toBe(422);

    const tampered = JSON.stringify({ ...event, id: "evt_tampered" });
    const invalid = await requestWebhook(tampered, forged.signature);
    expect(invalid.status).toBe(422);
  });

  it("deduplicates replays and ignores out-of-order status regressions", async () => {
    const client = await makeClient();
    const { order, sessionId } = await createPendingOrder(client);
    const paidEvent = await webhookEvent(sessionId, "paid", "evt_paid_once");
    const signed = signedWebhook(paidEvent);
    const first = await requestWebhook(signed.raw, signed.signature).expect(200);
    expect(first.body.duplicate).toBe(false);
    const replay = await requestWebhook(signed.raw, signed.signature).expect(200);
    expect(replay.body.duplicate).toBe(true);

    const failedEvent = await webhookEvent(sessionId, "failed", "evt_failed_late");
    const late = signedWebhook(failedEvent);
    const ignored = await requestWebhook(late.raw, late.signature).expect(200);
    expect(ignored.body.ignored).toBe(true);
    const after = await client.agent.get(`/api/orders/${order.id}`).expect(200);
    expect(after.body.order.status).toBe("paid");
    expect(after.body.order.receipt.totalMinor).toBe(32000);
  });

  it("ignores an event for an unknown payment session", async () => {
    const event = await webhookEvent("tst_unknown_session", "paid");
    const signed = signedWebhook(event);
    const response = await requestWebhook(signed.raw, signed.signature).expect(200);
    expect(response.body.ignored).toBe(true);
    const stored = await query("SELECT status FROM webhook_events");
    expect(stored.rows[0]!.status).toBe("ignored");
  });

  it("resolves a provider session only for the owning customer", async () => {
    const client = await makeClient();
    const { sessionId } = await createPendingOrder(client);
    const own = await client.agent.get(`/api/payment/session/${sessionId}`).expect(200);
    expect(own.body.payment.status).toBe("pending");
    const other = await makeClient();
    await other.agent.get(`/api/payment/session/${sessionId}`).expect(404);
  });

  it("refunds a paid order and records the refund", async () => {
    const client = await makeClient();
    const { order, sessionId } = await createPendingOrder(client);
    const paid = signedWebhook(await webhookEvent(sessionId, "paid"));
    await requestWebhook(paid.raw, paid.signature).expect(200);
    const refund = await client.agent
      .post(`/api/orders/${order.id}/refund`)
      .set("X-CSRF-Token", client.csrf)
      .set("Idempotency-Key", key("refund"))
      .send({ reason: "Customer requested a refund" })
      .expect(200);
    expect(refund.body.status).toBe("succeeded");
    const after = await client.agent.get(`/api/orders/${order.id}`).expect(200);
    expect(after.body.order.status).toBe("refunded");
    const rows = await query("SELECT count(*)::int AS count FROM refunds");
    expect(rows.rows[0]!.count).toBe(1);
  });

  it("reconciles stale provider sessions and releases expired stock exactly once", async () => {
    const client = await makeClient();
    const { order, payment, sessionId } = await createPendingOrder(client);
    await query(
      "UPDATE payments SET created_at = now() - interval '10 minutes' WHERE id = $1",
      [payment.id],
    );
    await query(
      "UPDATE test_payment_sessions SET status = 'paid', brand = 'Test Card', last4 = '4242', completed_at = now() WHERE session_id = $1",
      [sessionId],
    );
    const result = await reconcilePending();
    expect(result.applied).toBe(1);
    const after = await client.agent.get(`/api/orders/${order.id}`).expect(200);
    expect(after.body.order.status).toBe("paid");

    const expiring = await makeClient();
    const pending = await createPendingOrder(expiring);
    await query(
      "UPDATE inventory_reservations SET expires_at = now() - interval '1 minute' WHERE order_id = $1",
      [pending.order.id],
    );
    const stockBefore = await query("SELECT stock FROM skus WHERE sku = 'SONY-WH-1000'");
    await reconcilePending();
    await reconcilePending();
    const stockAfter = await query("SELECT stock FROM skus WHERE sku = 'SONY-WH-1000'");
    expect(stockAfter.rows[0]!.stock).toBe(stockBefore.rows[0]!.stock + 1);
    const canceled = await expiring.agent.get(`/api/orders/${pending.order.id}`).expect(200);
    expect(canceled.body.order.status).toBe("canceled");
  });
});

function requestWebhook(raw: string, signature: string) {
  return request(app)
    .post("/api/payment/webhook")
    .set("Content-Type", "application/json")
    .set("X-Payment-Signature", signature)
    .send(raw);
}
