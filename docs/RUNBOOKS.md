# Runbooks

## Local startup

```
docker run --name checkout-pg -e POSTGRES_USER=checkout -e POSTGRES_PASSWORD=checkout \
  -e POSTGRES_DB=checkout_test -p 55432:5432 -d postgres:16
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Vite proxies `/api` to `http://localhost:3001`. For a production-like check, run `npm run build` and serve `checkout-page/dist` from the Express app (it serves the built files automatically when present).

## Verification

```
npm run typecheck
npm run lint
npm run test
npm run build
npm run docs:check
```

Integration tests require the local Postgres above. They set their own test env values and must never point at a shared or production database.

## Payment incident / stuck pending orders

1. Check `GET /api/health` and structured logs by `X-Request-Id` / `correlationId`.
2. Inspect `payments`, `payment_events`, `webhook_events` and `inventory_reservations` for the order id. Never log raw webhook bodies.
3. Run `npm run reconcile`. It is idempotent: it verifies stale provider sessions, applies signed events and cancels expired reservations.
4. If a legitimate payment is paid but the order is still awaiting payment, fix the adapter/vendor callback and replay the **same signed event id**; `webhook_events` will dedupe it. Do not manually mark paid from the UI.
5. Refunds use `POST /api/orders/:id/refund` with an idempotency key. Verify the amount is positive and not greater than the payment amount.

## Suspected duplicate order or charge

- Confirm `idempotency_keys` for the customer/scope/key. Same key + same request should replay, not create.
- For already-created duplicates, stop the provider, reconcile, and handle refunds through the provider interface. Do not delete rows manually.

## CSRF/session failures

- Confirm same-origin/proxy configuration, `Secure` cookie setting, `COOKIE_DOMAIN`, clock skew and that the browser sends `X-CSRF-Token`.
- Webhook and test-provider routes intentionally skip CSRF; they must remain signature/nonce protected.

## Launch-gate failure

`assertLiveCheckoutAllowed` returns `LAUNCH_GATE_BLOCKED`. Do not bypass it. Update configuration only after the documented review, add a real provider adapter, then re-run the full test suite and launch checklist.
