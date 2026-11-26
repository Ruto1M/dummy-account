import { Router } from "express";
import {
  createPaymentRequestSchema,
  type CreatePaymentRequest,
} from "@checkout/shared";
import { asyncRoute, parseBody } from "../../lib/http.js";
import { readIdempotencyKey, runIdempotent } from "../../lib/idempotency.js";
import { loadSession, requireSession } from "../../lib/session.js";
import { config } from "../../config.js";
import { query, withTransaction } from "../../db.js";
import { errors } from "../../errors.js";
import {
  applyVerifiedEvent,
  createPayment,
  getPayment,
  getPaymentBySession,
  handleWebhook,
  paymentProvider,
} from "./service.js";
import { hostedNonce } from "./test-provider.js";

export const paymentRouter = Router();

paymentRouter.post("/payment/sessions", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  const input = parseBody<CreatePaymentRequest>(createPaymentRequestSchema, req.body);
  const key = readIdempotencyKey(req);
  const result = await runIdempotent({
    customerId: session.customerId,
    scope: "payment.create",
    key,
    request: input,
    work: (client) => createPayment(input, session, client),
  });
  res.status(result.replayed ? 200 : 201).json(result.value);
}));

paymentRouter.get("/payment/id/:id", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  res.json({ payment: await getPayment(String(req.params.id), session) });
}));

// The hosted-provider return URL carries the provider session id, not our
// internal payment id.
paymentRouter.get("/payment/session/:sessionId", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  res.json({ payment: await getPaymentBySession(String(req.params.sessionId), session) });
}));

paymentRouter.post("/payment/webhook", asyncRoute(async (req, res) => {
  const rawBody = (req as unknown as { rawBody?: string }).rawBody;
  if (typeof rawBody !== "string") throw errors.validation("Raw webhook body is required.");
  const result = await handleWebhook(rawBody, req.headers as Record<string, string | undefined>);
  res.json({ received: true, ...result });
}));

paymentRouter.post("/payment/test/complete", asyncRoute(async (req, res) => {
  if (config.providerMode !== "test") throw errors.forbidden();
  const sessionId = String(req.body?.session ?? "");
  const nonce = String(req.body?.nonce ?? "");
  const outcome = String(req.body?.outcome ?? "");
  if (!["paid", "failed", "canceled"].includes(outcome)) throw errors.validation("Invalid outcome.");

  const result = await withTransaction(async (client) => {
    const event = await paymentProvider.completeHosted({ sessionId, nonce, outcome: outcome as "paid" | "failed" | "canceled" }, client);
    const applied = await applyVerifiedEvent(event);
    const payment = await query<{ return_url: string }>(
      "SELECT return_url FROM payments WHERE provider_session_id = $1", [sessionId], client,
    );
    return { applied, returnUrl: payment.rows[0]?.return_url ?? config.publicWebOrigin };
  });
  const separator = result.returnUrl.includes("?") ? "&" : "?";
  res.redirect(303, `${result.returnUrl}${separator}payment=${encodeURIComponent(sessionId)}&result=${outcome}`);
}));

paymentRouter.get("/payment/hosted-checkout", asyncRoute(async (req, res) => {
  if (config.providerMode !== "test") throw errors.forbidden();
  const sessionId = String(req.query.session ?? "");
  const payment = await query<{
    id: string; method: string; status: string; amount_minor: number; currency: string; number: string;
  }>(
    `SELECT p.id, p.method, p.status, p.amount_minor, p.currency, o.number
       FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE p.provider_session_id = $1`,
    [sessionId],
  );
  const row = payment.rows[0];
  if (!row) throw errors.notFound("Payment session not found.");
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
  const amount = (row.amount_minor / 100).toFixed(2);
  const methodLabel = row.method === "card" ? "Credit card (test)" : "PayPal (test)";
  const disabledInputs = row.method === "card"
    ? `<label>Name on card<input disabled placeholder="Handled by secure provider"></label>
       <label>Card number<input disabled placeholder="Hosted fields — no PAN collected"></label>
       <div class="row"><label>Expiry<input disabled placeholder="MM/YY"></label><label>CVC<input disabled placeholder="Hosted"></label></div>`
    : `<p class="notice">You will be redirected to the provider's hosted PayPal confirmation.</p>`;

  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Secure payment — test provider</title>
<style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#1e293b;margin:0;padding:2rem}
main{max-width:34rem;margin:auto;background:white;padding:2rem;border-radius:1rem;box-shadow:0 1px 4px #cbd5e1}
label{display:block;margin:1rem 0;font-weight:600}input{display:block;width:100%;padding:.8rem;margin-top:.35rem;border:1px solid #cbd5e1;border-radius:.5rem;background:#f1f5f9}
.row{display:flex;gap:1rem}.row label{flex:1}button{padding:.8rem 1.4rem;border:0;border-radius:.6rem;font-weight:700;cursor:pointer}
.pay{background:#0284c7;color:white}.secondary{background:#e2e8f0;color:#334155}.notice{background:#fef3c7;padding:1rem;border-radius:.5rem}</style></head>
<body><main><h1>Secure payment</h1><p>Order ${escape(row.number)} — ${escape(row.currency)} ${amount}</p>
<p class="notice">TEST PROVIDER. No card data is collected or stored by this application. Choose an outcome to exercise the real webhook and order-state pipeline.</p>
<p>Method: ${escape(methodLabel)}</p>${disabledInputs}
<form method="post" action="/api/payment/test/complete">
<input type="hidden" name="session" value="${escape(sessionId)}">
<input type="hidden" name="nonce" value="${escape(hostedNonce(sessionId))}">
<button class="pay" name="outcome" value="paid" type="submit">Pay (test)</button>
<button class="secondary" name="outcome" value="canceled" type="submit">Cancel</button>
<button class="secondary" name="outcome" value="failed" type="submit">Decline</button>
</form></main></body></html>`);
}));

paymentRouter.get("/payment/hosted-fields/:paymentId", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  const payment = await getPayment(String(req.params.paymentId), session);
  res.json(paymentProvider.hostedFields({ method: payment.method, checkoutUrl: payment.checkoutUrl ?? "" }));
}));
