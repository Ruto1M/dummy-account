import { z } from "zod";
import { config } from "../../config.js";
import { query, type Queryable } from "../../db.js";
import { errors } from "../../errors.js";
import { hmac, randomToken, safeEqual } from "../../lib/security.js";
import type {
  CreateProviderSessionInput,
  PaymentProvider,
  ProviderEvent,
  ProviderSession,
  RefundInput,
  RefundResult,
  VerifyWebhookInput,
} from "./provider.js";

const webhookSchema = z.object({
  id: z.string().min(8),
  type: z.enum([
    "payment.succeeded",
    "payment.failed",
    "payment.canceled",
    "payment.requires_action",
    "payment.refunded",
    "payment.disputed",
  ]),
  data: z.object({
    sessionId: z.string().min(8),
    status: z.enum(["pending", "requires_action", "paid", "failed", "canceled", "refunded", "disputed"]),
    brand: z.string().nullable().default(null),
    last4: z.string().nullable().default(null),
    occurredAt: z.string(),
  }),
});

interface TestSessionRow {
  session_id: string;
  payment_id: string;
  status: string;
  brand: string | null;
  last4: string | null;
}

function nonceFor(sessionId: string): string {
  return hmac(`nonce:${sessionId}:${config.paymentWebhookSecret}`);
}

function eventFromSession(row: TestSessionRow, eventId: string, status: ProviderEvent["status"]): ProviderEvent {
  return {
    provider: "test",
    eventId,
    type: `payment.${status}`,
    sessionId: row.session_id,
    status,
    brand: row.brand,
    last4: row.last4,
    occurredAt: new Date().toISOString(),
  };
}

export const testPaymentProvider: PaymentProvider = {
  name: "test",
  mode: "test",

  async createSession(_input: CreateProviderSessionInput, _client: Queryable): Promise<ProviderSession> {
    const providerSessionId = `tst_${randomToken(18)}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    return {
      providerSessionId,
      checkoutUrl: `${config.publicApiOrigin}/api/payment/hosted-checkout?session=${encodeURIComponent(providerSessionId)}`,
      expiresAt,
    };
  },

  async registerSession(providerSessionId, paymentId, expiresAt, client): Promise<void> {
    await query(
      `INSERT INTO test_payment_sessions (session_id, payment_id, nonce_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [providerSessionId, paymentId, hmac(nonceFor(providerSessionId)), expiresAt ?? new Date(Date.now() + 30 * 60 * 1000)],
      client,
    );
  },

  async verifyWebhook(input: VerifyWebhookInput): Promise<ProviderEvent | null> {
    const header = input.headers["x-payment-signature"];
    if (!header) throw errors.validation("Missing payment signature.");
    const match = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(header);
    if (!match) throw errors.validation("Invalid payment signature format.");
    const timestamp = Number(match[1]);
    if (!Number.isFinite(timestamp)) throw errors.validation("Invalid payment signature timestamp.");
    if (Math.abs(Date.now() / 1000 - timestamp) > config.webhookToleranceSeconds) {
      throw errors.validation("Payment signature is outside the allowed time window.");
    }
    const expected = hmac(`${timestamp}.${input.rawBody}:${config.paymentWebhookSecret}`);
    if (!safeEqual(expected, match[2]!)) throw errors.validation("Payment signature verification failed.");

    const parsed = webhookSchema.safeParse(JSON.parse(input.rawBody));
    if (!parsed.success) return null;
    return {
      provider: "test",
      eventId: parsed.data.id,
      type: parsed.data.type,
      sessionId: parsed.data.data.sessionId,
      status: parsed.data.data.status,
      brand: parsed.data.data.brand,
      last4: parsed.data.data.last4,
      occurredAt: parsed.data.data.occurredAt,
    };
  },

  async verifySession(providerSessionId: string, client: Queryable): Promise<ProviderEvent | null> {
    const result = await query<TestSessionRow>(
      "SELECT session_id, payment_id, status, brand, last4 FROM test_payment_sessions WHERE session_id = $1",
      [providerSessionId], client,
    );
    const row = result.rows[0];
    if (!row || row.status === "pending") return null;
    const status = row.status === "paid" ? "paid" : row.status === "failed" ? "failed" : "canceled";
    return eventFromSession(row, `reconcile_${providerSessionId}`, status);
  },

  async refund(_input: RefundInput, _client: Queryable): Promise<RefundResult> {
    return { providerRefundId: `tre_${randomToken(12)}`, status: "succeeded" };
  },

  hostedFields(_input) {
    return {
      sessionId: "",
      provider: "test",
      mode: "test",
      status: "pending",
      card: { label: "Name on card / Card number", placeholder: "Handled by the hosted payment page" },
      expiry: { label: "Expiry", placeholder: "Hosted" },
      cvc: { label: "CVC", placeholder: "Hosted" },
      message: "Test mode: card details are never collected by this application.",
      actionLabel: "Continue to secure payment",
    };
  },

  async completeHosted(input, client) {
    const expected = nonceFor(input.sessionId);
    if (!safeEqual(expected, input.nonce)) throw errors.validation("Invalid hosted payment nonce.");
    const result = await query<TestSessionRow>(
      `SELECT session_id, payment_id, status, brand, last4 FROM test_payment_sessions
        WHERE session_id = $1 AND expires_at > now() FOR UPDATE`,
      [input.sessionId], client,
    );
    const row = result.rows[0];
    if (!row) throw errors.validation("That payment session has expired.", "session");
    if (row.status !== "pending") throw errors.validation("That payment session was already completed.", "session");
    const brand = input.outcome === "paid" ? "Test Card" : null;
    const last4 = input.outcome === "paid" ? "4242" : null;
    await query(
      "UPDATE test_payment_sessions SET status = $2, outcome = $3, brand = $4, last4 = $5, completed_at = now() WHERE session_id = $1",
      [input.sessionId, input.outcome, input.outcome, brand, last4], client,
    );
    return eventFromSession({ ...row, brand, last4 }, `evt_${randomToken(16)}`, input.outcome);
  },
};

export function signTestWebhook(timestamp: number, body: string): string {
  return `t=${timestamp},v1=${hmac(`${timestamp}.${body}:${config.paymentWebhookSecret}`)}`;
}

export function hostedNonce(sessionId: string): string {
  return nonceFor(sessionId);
}
