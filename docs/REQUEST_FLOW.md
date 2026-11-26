# Request flow

## Bootstrap

1. Browser calls `GET /api/bootstrap` with `credentials: same-origin`.
2. Server loads the session cookie. If absent, it creates a guest customer/session/cart and sets HttpOnly `checkout_session` plus readable `checkout_csrf` cookie with `SameSite=Lax` (and `Secure` in production).
3. Server returns product, cart, shipping options, compliance config and a fresh quote. The browser stores the CSRF token in memory and never in local/session storage.
4. Request context sets `X-Request-Id`; pino logs are redacted and never include request bodies, card data, tokens or passwords.

## Authenticated mutation

1. For every non-GET API call the browser sends `X-CSRF-Token` from memory.
2. `csrfProtection` verifies the double-submit cookie/header and origin policy. Webhook and test-provider callbacks are exempt because they are authenticated by signature or provider nonce instead.
3. Mutating checkout operations also require an `Idempotency-Key` header (`order.create`, `payment.create`, `order.refund`). Keys are scoped to the customer and operation; retries replay the stored response.

## Quote to paid order

1. Shipping form submits address + method. Server validates country/postal code, fetches active rates and creates a short-lived quote. Totals, lines, tax, discount and rounding rule are server-owned.
2. Review form records necessary/optional consent against `compliance.policyVersion`. Optional marketing is never preselected.
3. Payment form creates an order from the quote id/version/token. Server revalidates expiry, version, address, cart contents and stock inside a transaction, reserves stock, and stores an immutable snapshot.
4. Server creates a provider session. For the registered test adapter, the browser navigates to a hosted page that renders disabled, non-collecting placeholders. The React app never sees a PAN, expiry or CVC.
5. Test host posts a nonce-protected outcome. The provider adapter emits a signed event through `applyVerifiedEvent`, the same function used by `POST /api/payment/webhook`.
6. Webhook verification checks HMAC format, timestamp tolerance and body signature. Event id dedupe and status rank prevent replay, delay and out-of-order regressions.
7. On `paid`, server marks the order paid, stamps `paid_at`, creates a receipt and queues an email. The browser returns with the provider session id, resolves it through `GET /api/payment/session/:sessionId` (owner-only), re-fetches the order and only then shows confirmation. While `awaiting_payment`, it polls server state; it never invents success from the redirect.

## Failure paths

- Expired quote / changed cart / changed address / changed stock: generic user-safe message; browser is sent back to re-quote.
- Duplicate request with same key: stored response is replayed with `200` instead of creating a second order/payment/refund.
- Invalid CSRF: `403 CSRF_FAILED` with a reload message.
- Cross-customer order/payment id: `404 NOT_FOUND` (not `403`) to avoid confirming that another customer's resource exists.
- Login failure: identical generic message and status for unknown email and bad password; attempts are throttled.
- Payment failure/cancel: order is canceled or failed, stock reservation released once, browser shows a retry path.
- Timeout/network error: UI shows a retry message plus request id from `X-Request-Id`; no optimistic success.

## Reconciliation

`npm run reconcile` polls provider sessions for stale pending payments, applies verified events, and cancels orders whose reservations expired. It is safe to run repeatedly.
