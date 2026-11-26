# Card-data and PCI scope notes

The application is designed so card data never enters the React app, Express server, PostgreSQL database or logs.

## What the code does

- The checkout UI renders only method selection plus disabled hosted-field descriptors. There are no `cc-number`, `cc-exp` or `cc-csc` inputs in React.
- The test provider's hosted page contains disabled placeholders and explicitly says no card data is collected. Outcomes are chosen with a signed nonce and submitted directly to the test-provider endpoint.
- `payments` stores only provider-neutral fields: provider, method, status, brand, last4, amount, currency, checkout URL and timestamps.
- Structured logs redact authorization, cookie, token, password, secret and card-like fields; request bodies and raw webhook payloads are not logged.
- Webhook verification uses the raw body only for signature verification and never logs it.

## What is not established

- No PCI DSS validation, SAQ, Attestation of Compliance or QSA engagement exists here.
- No live/sandbox vendor adapter is registered. When a vendor is selected, its hosted-fields/redirect integration, allowed iframe/frame-ancestors settings and the exact SAQ scope must be reviewed with that provider and a qualified assessor.
- Server-side logs, backups, support tooling and observability exporters must be reviewed in the target environment; redaction in this repository is not a substitute for a compliance program.

## Never add to this codebase

Raw PAN, expiry, CVC/CVV, magnetic stripe data, PIN, provider API secrets, webhook signing secrets or cardholder data in URLs, forms, state managers, analytics, session storage, database rows, error messages or logs.
