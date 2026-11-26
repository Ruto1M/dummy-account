# Database schema and migrations

The only migration is `server/src/migrations/0001_init.ts`; `npm run db:migrate` applies it and records the version in `schema_migrations`. `npm run db:seed` loads demo catalog/config values with **test-only** data. Seeds are idempotent and never create credentials for a real user.

## Table groups

| Group | Tables | Purpose |
| --- | --- | --- |
| Identity | `customers`, `identities`, `sessions`, `recovery_tokens`, `login_attempts` | Server-side identity, scrypt hashes, hashed session and reset tokens, throttling counters. Cookies are HttpOnly; reset tokens are emailed to an outbox. |
| Catalog | `products`, `skus`, `carts`, `cart_items` | Product metadata, authoritative unit price in minor units, stock and per-customer carts (guest or registered). |
| Policy config | `compliance_config`, `policy_versions`, `tax_rules`, `shipping_zones`, `shipping_rates`, `promotions` | Runtime-configurable legal/tax/currency/jurisdiction/payment/shipping settings. Draft policies are never presented as reviewed. |
| Quotes | `quotes`, `quote_lines`, `promotion_redemptions` | Short-lived versioned quotes with token hash, integer money, line snapshots and expiry. |
| Orders | `orders`, `order_items`, `order_addresses`, `inventory_reservations`, `consents`, `fulfillment_events` | Immutable order snapshot, address/consent evidence, stock reservation with `released_at` to prevent double release. |
| Payments | `payments`, `test_payment_sessions`, `payment_events`, `webhook_events`, `refunds` | Provider-neutral payment state, test-adapter session state, event log, replay/dedupe ledger and refunds. |
| Ops | `idempotency_keys`, `outbox_emails`, `privacy_requests`, `audit_log` | Duplicate request protection, email queue, privacy workflow and redacted audit trail. |

## Money and rounding

- Every monetary column is `bigint`/`integer` minor units. No float money is stored or sent.
- `ROUNDING_RULE = HALF_UP_PER_LINE_MINOR_UNITS`; `roundHalfUp(numerator, denominator)` is unit-tested for boundary cases.
- Tax is configurable as `flat_per_unit` or `percent` (`rate_bps`) and may be inclusive/exclusive. Shipping is selected from active rates for the destination country.

## Transactions and invariants

- `createQuote`: one transaction writes quote + lines + token hash; expiry from `QUOTE_TTL_MINUTES`.
- `createOrder`: one transaction re-reads the quote by id/token/customer/expiry, verifies version, address, current cart contents, stock with `SELECT ... FOR UPDATE`, decrements stock, inserts order snapshot/address/consents/reservation, and records the idempotency response.
- `runIdempotency`: `(customer_id, scope, key_hash)` unique; same key + same request replays the stored response; same key + different body returns `IDEMPOTENCY_CONFLICT`.
- `applyVerifiedEvent`: inserts `(provider, event_id)` into `webhook_events` with `ON CONFLICT DO NOTHING`; duplicates return immediately. Payment status is monotonic by rank so delayed/out-of-order events cannot regress state.
- Stock release is guarded by `inventory_reservations.released_at IS NULL`, then set atomically, so webhook replay/reconciliation cannot restock twice.
- `payments` never stores a PAN, expiry, CVC or provider card secret. Only provider-neutral brand/last4 returned by the provider.

## Operational notes

Run `npm run db:migrate` before the API or tests. For a clean local database:

```
docker exec -i checkout-pg psql -U checkout -d checkout_test -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
npm run db:migrate
npm run db:seed
```

Migrations are additive in this repository. Changing a released migration requires a new numbered migration; do not edit `0001_init.ts` after deployment.
