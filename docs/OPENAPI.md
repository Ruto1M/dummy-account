# HTTP API contract (OpenAPI-equivalent)

Base URL: `/api`. All bodies and responses are JSON. All money is integer minor units. Errors use:

```json
{ "code": "VALIDATION_ERROR", "message": "Enter a valid postal code.", "field": "postalCode", "retryable": false, "requestId": "abc123" }
```

Codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `QUOTE_EXPIRED`, `PAYMENT_PENDING`, `PAYMENT_DECLINED`, `PAYMENT_CANCELLED`, `INVENTORY_CHANGED`, `IDEMPOTENCY_CONFLICT`, `LAUNCH_GATE_BLOCKED`, `UPSTREAM_UNAVAILABLE`, `CSRF_FAILED`, `INTERNAL`.

## Common headers

- `Cookie: checkout_session=...; checkout_csrf=...` set by the server. `checkout_session` is HttpOnly, SameSite=Lax, Secure in production.
- `X-CSRF-Token: <csrfToken>` required on all state-changing calls except provider callbacks.
- `Idempotency-Key: <12-100 url-safe chars>` required on `POST /orders`, `POST /payment/sessions`, `POST /orders/:id/refund`.
- `X-Request-Id` optional; echoed in responses and logs.

## Endpoints

| Method | Path | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| GET | `/health` | none | – | `{ok,database,providerMode,liveCheckoutEnabled,requests,errors,webhooks,uptimeSeconds}` |
| GET | `/health/metrics` | none | – | counters |
| GET | `/bootstrap` | creates guest | – | `Bootstrap` |
| GET | `/identity/session` | optional | – | `{user: SessionUser|null}` |
| POST | `/identity/guest` | none | – | `{user}` |
| POST | `/identity/register` | optional | `{email,password}` | `{user}`; merges guest cart |
| POST | `/identity/login` | optional | `{email,password}` | `{user}`; generic error on failure |
| POST | `/identity/logout` | required | – | `{ok}` |
| POST | `/identity/recovery` | none | `{email}` | `{ok,message}` (same for unknown email) |
| POST | `/identity/reset-password` | none | `{token,password}` | `{ok}` |
| GET | `/catalog/product` | required | – | `{product}` |
| GET | `/cart` | required | – | `{cart}` |
| PUT | `/cart/quantity` | required | `{sku,quantity}` | `{cart}` |
| POST | `/shipping/address` | required | `Address` | `{address,options,message}` |
| GET | `/shipping/options?country=GB` | required | – | `{options}` |
| POST | `/pricing/quote` | required | `{address,shippingMethod,promotionCode?}` | `{quote,promotion}` |
| POST | `/pricing/promotion` | required | same + required `promotionCode` | `{quote,promotion}` |
| GET | `/pricing/quote/:id?token=...` | required | – | `{quote}` |
| GET | `/compliance/config` | none | – | `{compliance}` |
| GET | `/policies/:key` | none | – | HTML policy page, draft banner if unreviewed |
| POST | `/privacy/requests` | optional | `{type,contact,details}` | `{id}` |
| GET | `/privacy/export` | required | – | `PrivacyExport` |
| POST | `/privacy/anonymize` | required | – | `{ok,message}` |
| POST | `/orders` | required, idempotent | `CreateOrderRequest` | `Order` (`201`, replay `200`) |
| GET | `/orders/:id` | required | – | `{order}`; `404` for other customers |
| POST | `/orders/:id/refund` | required, idempotent | `{reason,amountMinor?}` | `{id,status}` |
| POST | `/payment/sessions` | required, idempotent | `{orderId,method}` | `Payment` (`201`, replay `200`) |
| GET | `/payment/id/:id` | required | – | `{payment}` |
| GET | `/payment/session/:sessionId` | required | – | `{payment}` for the owning customer; `404` otherwise. Used by the hosted-provider return URL. |
| GET | `/payment/hosted-fields/:paymentId` | required | – | `HostedFields` descriptors, never raw card data |
| POST | `/payment/webhook` | provider signature | raw JSON body + `X-Payment-Signature: t=<unix>,v1=<hmac>` | `{received,duplicate,ignored}` |
| GET | `/payment/hosted-checkout?session=...` | test provider only | – | HTML hosted-fields page |
| POST | `/payment/test/complete` | test nonce only | form `{session,nonce,outcome}` | `303` redirect to return URL |

## Core schemas

```ts
Address = { line1, line2, city, postalCode, countryCode }
ShippingMethod = "standard" | "express" | "overnight"
PaymentMethod = "card" | "paypal"
CreateOrderRequest = {
  quoteId, quoteVersion, quoteToken, address, shippingMethod,
  consentNecessary: true, consentMarketing: boolean, consentVersion
}
Quote = { id, cartId, version, expiresAt, currency, taxInclusive, roundingRule,
  sku, quantity, unitPriceMinor, availability, discountMinor, promotionCode,
  taxMinor, shippingMinor, shippingMethod, subtotalMinor, totalMinor,
  lines: [{kind,label,amountMinor}], address, quoteToken }
Order = { id, number, status, paymentStatus, fulfillmentStatus, currency,
  totalMinor, createdAt, confirmationUrl, items, address, consents, receipt, message }
Payment = { id, orderId, orderNumber, provider, method, status, brand, last4,
  amountMinor, currency, checkoutUrl, expiresAt, returnUrl }
```

The authoritative Zod schemas are in `shared/src/index.ts`; TypeScript types are imported by both client and server. An OpenAPI 3 document can be generated from those schemas if a vendor tool is required.
