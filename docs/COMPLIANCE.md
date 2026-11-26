# Compliance posture and launch gates

This repository is a production-capable **implementation skeleton with test checkout only**. It does not claim legal compliance, certification, PCI DSS validation, tax registration, accessibility conformance or readiness to take live payments.

`GET /api/compliance/config` returns `launchGates`. Each gate is `verified`, `pending` or `unsupported`. Seed state deliberately contains failures:

| Gate | Seed status | What must happen before launch |
| --- | --- | --- |
| Seller legal identity | pending | Replace placeholder legal entity and verify registration. |
| Jurisdictions and currencies | verified | Re-confirm after any country/currency change. |
| Tax rules coverage | verified | Obtain qualified tax advice; configure current rates and filing. |
| Policies | pending | Terms, privacy, delivery, returns and refund text must be legally reviewed; only then mark reviewed. |
| Privacy | pending | Confirm controller, contact, retention periods and DSAR process with counsel. |
| Restrictions | verified | Confirm age/category restrictions and cookie inventory with counsel/consent platform. |
| Payment provider adapter | unsupported | Select provider, add vendor adapter behind `PaymentProvider`, complete their due diligence. |
| External review | pending | Record `reviewedAt` / `reviewedBy` only after qualified sign-off. |
| Consumer law | unsupported | Review cancellation, returns and warranty terms. |
| Fraud / AML / sanctions | unsupported | Configure and review a screening/fraud provider. |
| Accessibility | unsupported | Complete WCAG 2.2 AA manual and assistive-technology audit. |

`liveCheckoutEnabled` is false in seed data. `assertLiveCheckoutAllowed` rejects checkout if it is false or any gate is not `verified`. In the current build, `PAYMENT_PROVIDER=sandbox|live` also fails startup because no vendor adapter is registered. `PAYMENT_PROVIDER=test` requires `CHECKOUT_TEST_MODE=true`; test pages state that no real payment is taken.

## Implemented controls

- Server-authoritative price/tax/shipping; browser cannot submit amounts.
- Short-lived versioned quotes with hashed token and customer scope.
- Consent evidence with policy version, timestamp, necessary=true and optional marketing default false.
- Generic login errors, throttling counters, recovery token hash and expiry.
- HttpOnly SameSite cookies, CSRF double-submit, request ids and redacted structured logs.
- Idempotency, transactions, unique constraints, webhook signature/replay/dedupe and monotonic status handling.
- Privacy request/export/anonymize endpoints with audit logging.

## Still required operationally

Qualified legal/tax/privacy review, real provider integration and certification boundaries, email delivery, fraud screening, retention jobs, backup/restore, monitoring/alerting, penetration testing, accessibility audit and documented approvals. The UI displays draft-policy warnings and never says “compliant” or “certified”.
