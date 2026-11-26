# Launch checklist

Nothing below is satisfied by a green build alone. Live checkout is disabled by design in this repository.

## Blocking technical gates

- [ ] Select a payment provider; implement `PaymentProvider` with hosted fields, signature verification, refunds and session verification. Remove `PAYMENT_PROVIDER=test` from deployment.
- [ ] Add provider sandbox/live credentials to the deployment secret store. Never commit them.
- [ ] Configure same-origin reverse proxy, HTTPS, `COOKIE_SECURE=true`, domain and `PUBLIC_WEB_ORIGIN`.
- [ ] Supply real legal entity, jurisdictions, currencies, tax rules, shipping rates and payment methods.
- [ ] Replace draft policies and set `reviewedAt` / `reviewedBy` only after qualified review.
- [ ] Resolve every `launchGate` to `verified`. Keep `liveCheckoutEnabled=false` until then.
- [ ] Configure email delivery instead of the local outbox; test receipt and recovery delivery without logging secrets.
- [ ] Configure monitoring, alerting, backup/restore and retention/DSAR jobs.

## Required verification evidence

- [ ] `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm run docs:check` all pass against the target commit.
- [ ] Integration tests pass for auth/cross-customer access, price tampering, rounding/currency, inventory concurrency, idempotency, webhook signature/replay/delay/out-of-order, refunds and reconciliation.
- [ ] UI tests pass for labeled forms, keyboard flow, guest and registered checkout, and confirmation states.
- [ ] Manual browser golden path and failure path pass in a clean session.
- [ ] Accessibility audit (WCAG 2.2 AA) and assistive-technology review completed.
- [ ] Security review/penetration test completed; rate limits and provider dashboard limits configured.

## Explicitly not claimed here

No statement that the application is legally compliant, PCI certified, tax registered, fraud-safe or production-approved. The UI, logs and docs must continue to say what is test-only and what remains outstanding.
