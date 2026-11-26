export const up = String.raw`
-- Identity and sessions
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  name text NOT NULL DEFAULT 'Guest',
  is_guest boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  anonymized_at timestamptz
);
CREATE UNIQUE INDEX customers_email_unique ON customers (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE identities (
  customer_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  password_params jsonb NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX sessions_customer_idx ON sessions (customer_id) WHERE revoked_at IS NULL;

CREATE TABLE recovery_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE login_attempts (
  id bigserial PRIMARY KEY,
  email_hash text NOT NULL,
  ip_hash text NOT NULL,
  succeeded boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_lookup_idx ON login_attempts (email_hash, created_at DESC);

-- Catalog and cart
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL,
  image_url text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE skus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku text NOT NULL UNIQUE,
  currency char(3) NOT NULL,
  unit_price_minor integer NOT NULL CHECK (unit_price_minor >= 0),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  low_stock_threshold integer NOT NULL DEFAULT 3,
  max_quantity integer NOT NULL DEFAULT 10 CHECK (max_quantity > 0),
  UNIQUE (product_id, sku)
);

CREATE TABLE carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  currency char(3) NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ordered','abandoned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX carts_one_active_per_customer ON carts (customer_id) WHERE status = 'active';

CREATE TABLE cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES skus(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, sku_id)
);

-- Pricing configuration
CREATE TABLE promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('percent','flat')),
  value_bps integer,
  value_minor integer,
  currency char(3),
  min_subtotal_minor integer NOT NULL DEFAULT 0,
  max_discount_minor integer,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  usage_limit integer,
  active boolean NOT NULL DEFAULT true,
  description text NOT NULL DEFAULT '',
  CHECK ((kind = 'percent' AND value_bps IS NOT NULL) OR (kind = 'flat' AND value_minor IS NOT NULL))
);

CREATE TABLE promotion_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES promotions(id),
  order_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (promotion_id, order_id)
);

CREATE TABLE tax_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code char(2) NOT NULL,
  kind text NOT NULL CHECK (kind IN ('flat_per_unit','percent')),
  rate_bps integer,
  amount_minor integer,
  currency char(3) NOT NULL,
  inclusive boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  valid_from timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'percent' AND rate_bps IS NOT NULL) OR (kind = 'flat_per_unit' AND amount_minor IS NOT NULL))
);
CREATE INDEX tax_rules_country_idx ON tax_rules (country_code, valid_from DESC);

CREATE TABLE shipping_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code char(2) NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  label text NOT NULL
);

CREATE TABLE shipping_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES shipping_zones(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('standard','express','overnight')),
  label text NOT NULL,
  price_minor integer NOT NULL CHECK (price_minor >= 0),
  currency char(3) NOT NULL,
  eta_min_days integer NOT NULL CHECK (eta_min_days >= 0),
  eta_max_days integer NOT NULL CHECK (eta_max_days >= eta_min_days),
  active boolean NOT NULL DEFAULT true,
  UNIQUE (zone_id, method)
);

CREATE TABLE addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  line1 text NOT NULL,
  line2 text NOT NULL DEFAULT '',
  city text NOT NULL,
  postal_code text NOT NULL,
  country_code char(2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  cart_id uuid NOT NULL REFERENCES carts(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  token_hash text NOT NULL UNIQUE,
  address jsonb NOT NULL,
  shipping_method text NOT NULL CHECK (shipping_method IN ('standard','express','overnight')),
  currency char(3) NOT NULL,
  tax_inclusive boolean NOT NULL DEFAULT false,
  rounding_rule text NOT NULL DEFAULT 'HALF_UP_PER_LINE',
  sku text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_minor integer NOT NULL CHECK (unit_price_minor >= 0),
  availability text NOT NULL CHECK (availability IN ('in_stock','low_stock','reserved')),
  subtotal_minor integer NOT NULL CHECK (subtotal_minor >= 0),
  discount_minor integer NOT NULL CHECK (discount_minor >= 0),
  tax_minor integer NOT NULL CHECK (tax_minor >= 0),
  shipping_minor integer NOT NULL CHECK (shipping_minor >= 0),
  total_minor integer NOT NULL CHECK (total_minor >= 0),
  promotion_code text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quotes_customer_idx ON quotes (customer_id, created_at DESC);

CREATE TABLE quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('subtotal','discount','tax','shipping','total')),
  label text NOT NULL,
  amount_minor integer NOT NULL,
  position integer NOT NULL
);
CREATE INDEX quote_lines_quote_idx ON quote_lines (quote_id, position);

-- Orders, payments and their durable snapshots
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES customers(id),
  quote_id uuid NOT NULL REFERENCES quotes(id),
  status text NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN ('awaiting_payment','paid','failed','canceled','refunded','disputed')),
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','requires_action','paid','failed','canceled','refunded','disputed')),
  fulfillment_status text NOT NULL DEFAULT 'unfulfilled'
    CHECK (fulfillment_status IN ('unfulfilled','processing','shipped','delivered')),
  currency char(3) NOT NULL,
  subtotal_minor integer NOT NULL CHECK (subtotal_minor >= 0),
  discount_minor integer NOT NULL CHECK (discount_minor >= 0),
  tax_minor integer NOT NULL CHECK (tax_minor >= 0),
  shipping_minor integer NOT NULL CHECK (shipping_minor >= 0),
  total_minor integer NOT NULL CHECK (total_minor >= 0),
  promotion_code text,
  shipping_method text NOT NULL,
  policy_version text NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX orders_customer_idx ON orders (customer_id, created_at DESC);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku text NOT NULL,
  name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_minor integer NOT NULL CHECK (unit_price_minor >= 0),
  line_total_minor integer NOT NULL CHECK (line_total_minor >= 0)
);
CREATE INDEX order_items_order_idx ON order_items (order_id);

CREATE TABLE order_addresses (
  order_id uuid PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  line1 text NOT NULL,
  line2 text NOT NULL DEFAULT '',
  city text NOT NULL,
  postal_code text NOT NULL,
  country_code char(2) NOT NULL
);

CREATE TABLE inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id uuid NOT NULL REFERENCES skus(id),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  cart_id uuid REFERENCES carts(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  expires_at timestamptz NOT NULL,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (order_id IS NOT NULL OR cart_id IS NOT NULL)
);
CREATE UNIQUE INDEX inventory_one_per_order_sku ON inventory_reservations (order_id, sku_id) WHERE order_id IS NOT NULL;

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  provider text NOT NULL,
  provider_session_id text NOT NULL UNIQUE,
  method text NOT NULL CHECK (method IN ('card','paypal')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','requires_action','paid','failed','canceled','refunded','disputed')),
  brand text,
  last4 text CHECK (last4 IS NULL OR last4 ~ '^[0-9]{4}$'),
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL,
  checkout_url text,
  expires_at timestamptz,
  return_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_order_idx ON payments (order_id);

-- State owned by the TEST payment adapter only. Never used in sandbox/live mode.
CREATE TABLE test_payment_sessions (
  session_id text PRIMARY KEY,
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','canceled')),
  brand text,
  last4 text,
  outcome text,
  nonce_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz
);

CREATE TABLE payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  status text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_events_payment_idx ON payment_events (payment_id, created_at);

CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','processed','ignored','failed')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, event_id)
);

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id),
  order_id uuid NOT NULL REFERENCES orders(id),
  provider_refund_id text NOT NULL UNIQUE,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refunds_order_idx ON refunds (order_id);

CREATE TABLE fulfillment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('unfulfilled','processing','shipped','delivered')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fulfillment_events_order_idx ON fulfillment_events (order_id, created_at DESC);

-- Compliance and operational records
CREATE TABLE consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  order_id uuid REFERENCES orders(id),
  kind text NOT NULL CHECK (kind IN ('necessary','marketing')),
  version text NOT NULL,
  granted boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consents_customer_idx ON consents (customer_id, recorded_at DESC);

CREATE TABLE policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  document jsonb NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by text NOT NULL DEFAULT 'UNREVIEWED'
);

CREATE TABLE privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id),
  type text NOT NULL CHECK (type IN ('access','correction','export','deletion')),
  contact text NOT NULL,
  details text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE compliance_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  document jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash text NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id),
  scope text NOT NULL,
  request_hash text NOT NULL,
  response jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  UNIQUE (customer_id, scope, key_hash)
);

CREATE TABLE outbox_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('recovery','receipt','refund')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  target text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;
