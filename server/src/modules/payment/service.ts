import type { CreatePaymentRequest, Payment, PaymentStatus, RefundRequest } from "@checkout/shared";
import { config } from "../../config.js";
import { pool, query, withTransaction, type Queryable } from "../../db.js";
import { errors } from "../../errors.js";
import { audit } from "../../logger.js";
import type { SessionContext } from "../../lib/session.js";
import { getCompliance, assertTestCheckoutAllowed } from "../compliance/service.js";
import { markOrderFailed, markOrderPaid } from "../orders/service.js";
import type { ProviderEvent } from "./provider.js";
import { testPaymentProvider } from "./test-provider.js";

export const paymentProvider = testPaymentProvider;

interface PaymentRow {
  id: string;
  order_id: string;
  provider: string;
  method: Payment["method"];
  status: PaymentStatus;
  brand: string | null;
  last4: string | null;
  amount_minor: number;
  currency: string;
  checkout_url: string | null;
  expires_at: Date | null;
  return_url: string;
  provider_session_id: string;
  created_at: Date;
  number: string;
}

const statusRank: Record<PaymentStatus, number> = {
  pending: 0,
  requires_action: 1,
  failed: 2,
  canceled: 2,
  paid: 3,
  disputed: 4,
  refunded: 4,
};

function mapPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    orderId: row.order_id,
    orderNumber: row.number,
    provider: row.provider,
    method: row.method,
    status: row.status,
    brand: row.brand,
    last4: row.last4,
    amountMinor: row.amount_minor,
    currency: row.currency.trim(),
    checkoutUrl: row.checkout_url,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    returnUrl: row.return_url,
  };
}

async function loadPaymentForOrder(
  orderId: string,
  session: SessionContext,
  client: Queryable,
): Promise<PaymentRow> {
  const result = await query<PaymentRow>(
    `SELECT p.*, o.number FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE p.order_id = $1 AND o.customer_id = $2
      ORDER BY p.created_at DESC LIMIT 1`,
    [orderId, session.customerId], client,
  );
  const row = result.rows[0];
  if (!row) throw errors.notFound("Order not found.");
  return row;
}

export async function createPayment(
  input: CreatePaymentRequest,
  session: SessionContext,
  client: Queryable,
): Promise<Payment> {
  const order = await query<{
    id: string; status: string; total_minor: number; currency: string; number: string;
  }>(
    `SELECT id, status, total_minor, currency, number FROM orders
      WHERE id = $1 AND customer_id = $2`,
    [input.orderId, session.customerId], client,
  );
  const orderRow = order.rows[0];
  if (!orderRow) throw errors.notFound("Order not found.");
  if (orderRow.status !== "awaiting_payment") throw errors.conflict("This order is no longer awaiting payment.");
  const compliance = await getCompliance();
  assertTestCheckoutAllowed(compliance);
  if (!compliance.paymentMethods.includes(input.method)) {
    throw errors.validation("That payment method is unavailable.", "method");
  }

  const returnUrl = `${config.publicWebOrigin}/?order=${orderRow.id}`;
  const providerSession = await paymentProvider.createSession({
    paymentId: "",
    orderId: orderRow.id,
    amountMinor: orderRow.total_minor,
    currency: orderRow.currency,
    method: input.method,
    returnUrl,
  }, client);

  const inserted = await query<PaymentRow>(
    `INSERT INTO payments (
       order_id, provider, provider_session_id, method, status, amount_minor, currency,
       checkout_url, expires_at, return_url)
     VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      orderRow.id, paymentProvider.name, providerSession.providerSessionId, input.method,
      orderRow.total_minor, orderRow.currency, providerSession.checkoutUrl,
      providerSession.expiresAt, returnUrl,
    ], client,
  );
  const payment = inserted.rows[0]!;
  await paymentProvider.registerSession(
    providerSession.providerSessionId, payment.id, providerSession.expiresAt, client,
  );
  await query(
    "INSERT INTO payment_events (payment_id, event_type, status, payload) VALUES ($1,'session.created','pending',$2::jsonb)",
    [payment.id, JSON.stringify({ provider: paymentProvider.name, method: input.method })], client,
  );
  audit("payment_session_created", {
    customerId: session.customerId, orderId: orderRow.id, paymentId: payment.id,
    correlationId: orderRow.number,
  });
  return mapPayment({ ...payment, number: orderRow.number });
}

export async function getPayment(paymentId: string, session: SessionContext): Promise<Payment> {
  const result = await query<PaymentRow>(
    `SELECT p.*, o.number FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE p.id = $1 AND o.customer_id = $2`,
    [paymentId, session.customerId],
  );
  const row = result.rows[0];
  if (!row) throw errors.notFound("Payment not found.");
  return mapPayment(row);
}

export async function getPaymentBySession(providerSessionId: string, session: SessionContext): Promise<Payment> {
  const result = await query<PaymentRow>(
    `SELECT p.*, o.number FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE p.provider_session_id = $1 AND o.customer_id = $2`,
    [providerSessionId, session.customerId],
  );
  const row = result.rows[0];
  if (!row) throw errors.notFound("Payment not found.");
  return mapPayment(row);
}

export async function applyVerifiedEvent(event: ProviderEvent): Promise<{ duplicate: boolean; ignored: boolean }> {
  return withTransaction(async (client) => {
    const inserted = await query<{ id: string }>(
      `INSERT INTO webhook_events (provider, event_id, event_type, payload_hash)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (provider, event_id) DO NOTHING
       RETURNING id`,
      [event.provider, event.eventId, event.type, event.occurredAt],
      client,
    );
    if (!inserted.rowCount) return { duplicate: true, ignored: true };

    const payment = await query<{
      id: string; order_id: string; status: PaymentStatus; number: string; customer_id: string;
    }>(
      `SELECT p.id, p.order_id, p.status, o.number, o.customer_id
         FROM payments p JOIN orders o ON o.id = p.order_id
        WHERE p.provider_session_id = $1 FOR UPDATE OF p`,
      [event.sessionId], client,
    );
    const current = payment.rows[0];
    if (!current) {
      await query("UPDATE webhook_events SET status = 'ignored', processed_at = now() WHERE id = $1", [inserted.rows[0]!.id], client);
      return { duplicate: false, ignored: true };
    }

    await query(
      `INSERT INTO payment_events (payment_id, event_type, status, payload)
       VALUES ($1,$2,$3,$4::jsonb)`,
      [current.id, event.type, event.status, JSON.stringify(event)], client,
    );

    if (statusRank[event.status] < statusRank[current.status]) {
      await query("UPDATE webhook_events SET status = 'ignored', processed_at = now() WHERE id = $1", [inserted.rows[0]!.id], client);
      return { duplicate: false, ignored: true };
    }

    await query(
      `UPDATE payments SET status = $2, brand = COALESCE($3, brand), last4 = COALESCE($4, last4),
         updated_at = now() WHERE id = $1`,
      [current.id, event.status, event.brand, event.last4], client,
    );

    if (event.status === "paid") {
      await markOrderPaid(current.order_id, client, new Date(event.occurredAt));
      await query(
        `INSERT INTO outbox_emails (recipient, subject, body, purpose)
         SELECT c.email, $2, $3, 'receipt'
           FROM customers c WHERE c.id = $1 AND c.email IS NOT NULL`,
        [current.customer_id, "Your receipt", `Receipt for order ${current.number}`], client,
      );
    } else if (["failed", "canceled", "disputed", "refunded"].includes(event.status)) {
      const orderStatus = event.status === "disputed" || event.status === "refunded" ? event.status : event.status;
      await markOrderFailed(current.order_id, client, orderStatus as "failed" | "canceled" | "disputed" | "refunded");
    }

    await query("UPDATE webhook_events SET status = 'processed', processed_at = now() WHERE id = $1", [inserted.rows[0]!.id], client);
    audit("payment_event_applied", {
      orderId: current.order_id, paymentId: current.id, correlationId: current.number,
      status: event.status, eventId: event.eventId,
    });
    return { duplicate: false, ignored: false };
  });
}

export async function handleWebhook(
  rawBody: string,
  headers: Record<string, string | undefined>,
): Promise<{ duplicate: boolean; ignored: boolean }> {
  const event = await paymentProvider.verifyWebhook({ rawBody, headers });
  if (!event) return { duplicate: false, ignored: true };
  return applyVerifiedEvent(event);
}

export async function createRefund(
  orderId: string,
  input: Omit<RefundRequest, "orderId">,
  session: SessionContext,
): Promise<{ id: string; status: string }> {
  return withTransaction(async (client) => {
    const payment = await loadPaymentForOrder(orderId, session, client);
    const order = await query<{ status: string; total_minor: number; currency: string; number: string }>(
      "SELECT status, total_minor, currency, number FROM orders WHERE id = $1 FOR UPDATE",
      [orderId], client,
    );
    const orderRow = order.rows[0];
    if (!orderRow || !["paid", "refunded", "disputed"].includes(orderRow.status)) {
      throw errors.conflict("Only paid orders can be refunded.");
    }
    const amount = input.amountMinor ?? payment.amount_minor;
    if (amount <= 0 || amount > payment.amount_minor) throw errors.validation("Invalid refund amount.", "amountMinor");

    const result = await paymentProvider.refund({
      paymentId: payment.id,
      providerSessionId: payment.provider_session_id,
      amountMinor: amount,
      currency: payment.currency,
      reason: input.reason,
    }, client);
    const inserted = await query<{ id: string }>(
      `INSERT INTO refunds (payment_id, order_id, provider_refund_id, amount_minor, currency, reason, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [payment.id, orderId, result.providerRefundId, amount, payment.currency, input.reason, result.status], client,
    );
    await query("UPDATE payments SET status = 'refunded', updated_at = now() WHERE id = $1", [payment.id], client);
    await query("UPDATE orders SET status = 'refunded', payment_status = 'refunded', updated_at = now() WHERE id = $1", [orderId], client);
    await query(
      `INSERT INTO outbox_emails (recipient, subject, body, purpose)
       SELECT email, $2, $3, 'refund'
         FROM customers WHERE id = $1 AND email IS NOT NULL`,
      [session.customerId, "Refund confirmation", `Refund for order ${orderRow.number}`], client,
    );
    audit("refund_created", {
      customerId: session.customerId, orderId, paymentId: payment.id,
      correlationId: orderRow.number, amountMinor: amount,
    });
    return { id: inserted.rows[0]!.id, status: result.status };
  });
}

export async function reconcilePending(): Promise<{ checked: number; applied: number; expired: number }> {
  const pending = await query<{ provider_session_id: string }>(
    `SELECT provider_session_id FROM payments
      WHERE status IN ('pending','requires_action') AND created_at < now() - interval '5 minutes'`,
  );
  let applied = 0;
  for (const row of pending.rows) {
    const event = await paymentProvider.verifySession(row.provider_session_id, pool);
    if (event) {
      const result = await applyVerifiedEvent(event);
      if (!result.duplicate && !result.ignored) applied += 1;
    }
  }
  const expired = await query<{ order_id: string }>(
    `SELECT r.order_id FROM inventory_reservations r
       JOIN orders o ON o.id = r.order_id
      WHERE r.released_at IS NULL AND r.expires_at < now()
        AND o.status = 'awaiting_payment'`,
  );
  for (const row of expired.rows) {
    await withTransaction(async (client) => {
      await markOrderFailed(row.order_id, client, "canceled");
      await query("UPDATE payments SET status = 'canceled', updated_at = now() WHERE order_id = $1 AND status = 'pending'", [row.order_id], client);
    });
  }
  audit("reconcile_complete", { checked: pending.rows.length, applied, expired: expired.rows.length });
  return { checked: pending.rows.length, applied, expired: expired.rows.length };
}
