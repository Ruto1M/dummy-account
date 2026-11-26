// src/app.ts
import { existsSync } from "fs";
import { fileURLToPath as fileURLToPath2 } from "url";
import { dirname, join } from "path";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";

// src/db.ts
import pg from "pg";

// src/config.ts
import dotenv from "dotenv";
import { fileURLToPath } from "url";
dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
dotenv.config();
function read(name) {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : void 0;
}
function requireSecret(name, minimumLength = 32) {
  const value = read(name);
  if (!value) {
    throw new Error(`Missing required configuration: ${name}. See .env.example.`);
  }
  if (value.length < minimumLength) {
    throw new Error(`${name} must be at least ${minimumLength} characters.`);
  }
  return value;
}
var nodeEnv = read("NODE_ENV") ?? "development";
var providerMode = read("PAYMENT_PROVIDER") ?? "test";
var config = {
  nodeEnv,
  isTest: nodeEnv === "test",
  isProduction: nodeEnv === "production",
  port: Number(read("PORT") ?? "3001"),
  databaseUrl: requireSecret("DATABASE_URL", 8),
  sessionSecret: requireSecret("SESSION_SECRET"),
  csrfSecret: requireSecret("CSRF_SECRET"),
  paymentWebhookSecret: requireSecret("PAYMENT_WEBHOOK_SECRET"),
  providerMode,
  // No live vendor adapter exists in this codebase. Live mode must never be assumed available.
  checkoutTestMode: read("CHECKOUT_TEST_MODE") !== "false",
  publicWebOrigin: read("PUBLIC_WEB_ORIGIN") ?? "http://localhost:5173",
  publicApiOrigin: read("PUBLIC_API_ORIGIN") ?? "http://localhost:3001",
  cookieSecure: read("COOKIE_SECURE") === "true",
  cookieDomain: read("COOKIE_DOMAIN"),
  sessionTtlHours: Number(read("SESSION_TTL_HOURS") ?? "12"),
  quoteTtlMinutes: Number(read("QUOTE_TTL_MINUTES") ?? "10"),
  reservationTtlMinutes: Number(read("RESERVATION_TTL_MINUTES") ?? "20"),
  webhookToleranceSeconds: Number(read("WEBHOOK_TOLERANCE_SECONDS") ?? "300"),
  logLevel: read("LOG_LEVEL") ?? (nodeEnv === "test" ? "silent" : "info"),
  emailSender: read("EMAIL_SENDER") ?? "outbox"
};
if (!["test", "sandbox", "live"].includes(config.providerMode)) {
  throw new Error("PAYMENT_PROVIDER must be one of: test, sandbox, live.");
}
if (config.providerMode !== "test") {
  throw new Error(
    `PAYMENT_PROVIDER=${config.providerMode} is not supported: no live/sandbox vendor adapter is registered. Keep the provider-neutral interface and supply an adapter after provider selection.`
  );
}
if (config.providerMode === "test" && !config.checkoutTestMode) {
  throw new Error("CHECKOUT_TEST_MODE must be true when PAYMENT_PROVIDER=test.");
}
if (config.isProduction && !config.cookieSecure) {
  throw new Error("COOKIE_SECURE=true is required in production.");
}

// src/logger.ts
import pino from "pino";
var logger = pino({
  level: config.logLevel,
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "req.body.password",
      "req.body.cardNumber",
      "req.body.cvv",
      "req.body.expiry",
      "req.body.quoteToken",
      "*.password",
      "*.cardNumber",
      "*.cvv",
      "*.token",
      "*.csrfToken"
    ],
    censor: "[REDACTED]"
  },
  base: { service: "checkout-api", environment: config.nodeEnv }
});
function audit(action, fields = {}) {
  logger.info({ event: "audit", action, ...fields }, "audit event");
}

// src/db.ts
var pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 3e4,
  connectionTimeoutMillis: 5e3
});
pool.on("error", (error) => {
  logger.error({ err: error.message }, "idle PostgreSQL client error");
});
async function query(sql, params = [], client = pool) {
  return client.query(sql, params);
}
async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
async function closeDatabase() {
  await pool.end();
}

// src/lib/http.ts
import { ZodError } from "zod";

// src/errors.ts
var AppError = class extends Error {
  code;
  status;
  field;
  retryable;
  constructor(options) {
    super(options.message);
    this.name = "AppError";
    this.code = options.code;
    this.status = options.status ?? 400;
    this.field = options.field;
    this.retryable = options.retryable ?? false;
  }
};
var errors = {
  validation: (message, field) => new AppError({ code: "VALIDATION_ERROR", message, status: 422, field }),
  unauthorized: (message = "Please sign in to continue.") => new AppError({ code: "UNAUTHORIZED", message, status: 401 }),
  forbidden: (message = "You do not have access to this resource.") => new AppError({ code: "FORBIDDEN", message, status: 403 }),
  notFound: (message = "The requested resource was not found.") => new AppError({ code: "NOT_FOUND", message, status: 404 }),
  conflict: (message) => new AppError({ code: "CONFLICT", message, status: 409 }),
  rateLimited: (message = "Too many attempts. Please try again shortly.") => new AppError({ code: "RATE_LIMITED", message, status: 429, retryable: true }),
  quoteExpired: () => new AppError({
    code: "QUOTE_EXPIRED",
    message: "Your price has expired. Review the latest total and try again.",
    status: 409,
    retryable: true
  }),
  inventoryChanged: () => new AppError({
    code: "INVENTORY_CHANGED",
    message: "Availability changed while you were checking out. Review your cart and try again.",
    status: 409,
    retryable: true
  }),
  idempotencyConflict: () => new AppError({
    code: "IDEMPOTENCY_CONFLICT",
    message: "That request key was already used with different details.",
    status: 409
  }),
  launchGateBlocked: (message = "Checkout is not open yet. Required launch checks are incomplete.") => new AppError({ code: "LAUNCH_GATE_BLOCKED", message, status: 423 }),
  paymentPending: () => new AppError({
    code: "PAYMENT_PENDING",
    message: "Your payment is still being confirmed. This page will update automatically.",
    status: 409,
    retryable: true
  }),
  paymentDeclined: () => new AppError({
    code: "PAYMENT_DECLINED",
    message: "The payment was not approved. Choose another method or try again.",
    status: 402
  }),
  paymentCancelled: () => new AppError({
    code: "PAYMENT_CANCELLED",
    message: "Payment was cancelled. Your order was not charged.",
    status: 409,
    retryable: true
  }),
  upstream: (message = "A dependent service is unavailable. Please retry.") => new AppError({ code: "UPSTREAM_UNAVAILABLE", message, status: 503, retryable: true }),
  internal: () => new AppError({ code: "INTERNAL", message: "Something went wrong. Please try again.", status: 500, retryable: true })
};

// src/metrics.ts
var metrics = {
  requests: 0,
  errors: 0,
  webhooks: 0,
  startedAt: Date.now()
};
function metricsSnapshot() {
  return {
    requests: metrics.requests,
    errors: metrics.errors,
    webhooks: metrics.webhooks,
    uptimeSeconds: Math.round((Date.now() - metrics.startedAt) / 1e3)
  };
}

// src/lib/security.ts
import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from "crypto";
import { promisify } from "util";
var scrypt = promisify(scryptCallback);
function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}
function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}
function hmac(value) {
  return createHash("sha256").update(value).digest("hex");
}
function signCsrf(nonce) {
  const signature = createHmac("sha256", config.csrfSecret).update(nonce).digest("base64url");
  return `${nonce}.${signature}`;
}
function verifyCsrf(value) {
  if (typeof value !== "string") return false;
  const [nonce] = value.split(".");
  if (!nonce) return false;
  const expected = signCsrf(nonce);
  const a = Buffer.from(expected);
  const b = Buffer.from(value);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function hashPassword(password) {
  const salt = randomBytes(16);
  const N = 16384;
  const r = 8;
  const p = 1;
  const derived = await scrypt(password, salt, 32, {
    N,
    r,
    p,
    maxmem: 64 * 1024 * 1024
  });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${derived.toString("base64")}`;
}
async function verifyPassword(password, stored) {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltEncoded, hashEncoded] = parts;
  const expected = Buffer.from(hashEncoded, "base64");
  const salt = Buffer.from(saltEncoded, "base64");
  const actual = await scrypt(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function hashForIndex(value) {
  return createHash("sha256").update(value.toLowerCase()).digest("hex");
}

// src/lib/http.ts
function asyncRoute(handler) {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}
function parseBody(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const field = first?.path.map(String).join(".");
    throw errors.validation(first?.message ?? "Invalid request.", field);
  }
  return result.data;
}
function requestId(res) {
  return String(res.locals.requestId ?? "unknown");
}
function correlationFields(res) {
  return {
    requestId: requestId(res),
    correlationId: String(res.locals.correlationId ?? requestId(res)),
    orderId: res.locals.orderId,
    paymentId: res.locals.paymentId
  };
}
function requestContext(req, res, next) {
  const incoming = req.header("x-request-id");
  const id = incoming && /^[a-zA-Z0-9_-]{8,64}$/.test(incoming) ? incoming : randomToken(12);
  res.locals.requestId = id;
  res.locals.correlationId = req.header("x-correlation-id") ?? id;
  res.setHeader("X-Request-Id", id);
  metrics.requests += 1;
  next();
}
function csrfProtection(req, _res, next) {
  if (req.path.includes("/payment/webhook") || req.path.includes("/payment/test/")) {
    next();
    return;
  }
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  const cookie = req.cookies?.checkout_csrf;
  const header = req.header("x-csrf-token");
  if (!cookie || !header || !verifyCsrf(cookie) || !safeEqual(cookie, header)) {
    next(new AppError({
      code: "CSRF_FAILED",
      message: "Your session expired. Reload the page and try again.",
      status: 403,
      retryable: true
    }));
    return;
  }
  next();
}
function errorHandler(err, req, res, _next) {
  if (res.headersSent) return;
  let status = 500;
  let payload = {
    code: "INTERNAL",
    message: "Something went wrong. Please try again.",
    retryable: true,
    requestId: requestId(res)
  };
  if (err instanceof AppError) {
    status = err.status;
    payload = {
      code: err.code,
      message: err.message,
      retryable: err.retryable,
      requestId: requestId(res)
    };
    if (err.field) Object.assign(payload, { field: err.field });
  } else if (err instanceof ZodError) {
    const first = err.issues[0];
    status = 422;
    payload = {
      code: "VALIDATION_ERROR",
      message: first?.message ?? "Invalid request.",
      retryable: false,
      requestId: requestId(res)
    };
    if (first?.path.length) Object.assign(payload, { field: first.path.map(String).join(".") });
  } else if (typeof err === "object" && err !== null && "code" in err && err.code === "23505") {
    status = 409;
    payload = { code: "CONFLICT", message: "That record already exists.", retryable: false, requestId: requestId(res) };
  } else if (typeof err === "object" && err !== null && "code" in err && err.code === "CSRF_FAILED") {
    status = 403;
    payload = { code: "CSRF_FAILED", message: "Your session expired. Reload the page and try again.", retryable: true, requestId: requestId(res) };
  } else if (typeof err === "object" && err !== null && "status" in err && err.status === 429) {
    status = 429;
    payload = { code: "RATE_LIMITED", message: "Too many attempts. Please try again shortly.", retryable: true, requestId: requestId(res) };
  }
  if (status >= 400) metrics.errors += 1;
  const log = status >= 500 ? logger.error : logger.warn;
  log.call(logger, {
    ...correlationFields(res),
    err: err instanceof Error ? err.message : String(err),
    ...status >= 500 && process.env.NODE_ENV !== "production" && err instanceof Error ? { stack: err.stack } : {},
    method: req.method,
    path: req.path,
    status
  }, "request failed");
  res.status(status).json(payload);
}

// src/modules/bootstrap/routes.ts
import { Router } from "express";

// src/lib/session.ts
var SESSION_COOKIE = "checkout_session";
var CSRF_COOKIE = "checkout_csrf";
async function loadSession(req, client = pool) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  const rows = await query(
    `SELECT s.id, s.customer_id, s.csrf_token, c.name, c.email, c.is_guest
       FROM sessions s JOIN customers c ON c.id = s.customer_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [tokenHash(token)],
    client
  );
  const row = rows.rows[0];
  if (!row) return null;
  await query("UPDATE sessions SET last_seen_at = now() WHERE id = $1", [row.id], client);
  return {
    sessionId: row.id,
    customerId: row.customer_id,
    csrfToken: row.csrf_token,
    name: row.name,
    email: row.email,
    isGuest: row.is_guest
  };
}
function setSessionCookies(res, token, csrfToken) {
  const base = {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    path: "/",
    domain: config.cookieDomain,
    maxAge: config.sessionTtlHours * 60 * 60 * 1e3
  };
  res.cookie(SESSION_COOKIE, token, base);
  res.cookie(CSRF_COOKIE, csrfToken, { ...base, httpOnly: false });
}
function clearSessionCookies(res) {
  const base = {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    path: "/",
    domain: config.cookieDomain
  };
  res.clearCookie(SESSION_COOKIE, base);
  res.clearCookie(CSRF_COOKIE, { ...base, httpOnly: false });
}
function requireSession(session) {
  if (!session) throw errors.unauthorized();
  return session;
}
function emailIndex(email) {
  return hashForIndex(email);
}

// src/modules/catalog/service.ts
var FEATURED_SKU = "SONY-WH-1000";
function mapProduct(row) {
  return {
    sku: row.sku,
    name: row.name,
    description: row.description,
    imageUrl: row.image_url,
    unitPriceMinor: row.unit_price_minor,
    currency: row.currency,
    available: row.active && row.stock > 0,
    availableQuantity: row.stock,
    maxQuantity: Math.min(row.max_quantity, row.stock)
  };
}
async function getFeaturedProduct(client = pool) {
  const result = await query(
    `SELECT s.id, s.sku, s.currency, s.unit_price_minor, s.stock, s.low_stock_threshold, s.max_quantity,
            p.name, p.description, p.image_url, p.active
       FROM skus s JOIN products p ON p.id = s.product_id
      WHERE s.sku = $1 AND p.active`,
    [FEATURED_SKU],
    client
  );
  const row = result.rows[0];
  if (!row) throw errors.notFound("Product is unavailable.");
  return mapProduct(row);
}
async function getSku(sku, client, forUpdate = false) {
  const result = await query(
    `SELECT s.id, s.sku, s.currency, s.unit_price_minor, s.stock, s.low_stock_threshold, s.max_quantity,
            p.name, p.description, p.image_url, p.active
       FROM skus s JOIN products p ON p.id = s.product_id
      WHERE s.sku = $1 ${forUpdate ? "FOR UPDATE OF s" : ""}`,
    [sku],
    client
  );
  const row = result.rows[0];
  if (!row) throw errors.notFound("Product is unavailable.");
  return row;
}

// src/modules/cart/service.ts
async function ensureCart(customerId, client = pool, currency = "GBP") {
  const existing = await query(
    `SELECT id, currency FROM carts WHERE customer_id = $1 AND status = 'active'`,
    [customerId],
    client
  );
  if (existing.rows[0]) return existing.rows[0];
  const created = await query(
    `INSERT INTO carts (customer_id, currency) VALUES ($1, $2)
     ON CONFLICT (customer_id) WHERE status = 'active' DO NOTHING
     RETURNING id, currency`,
    [customerId, currency],
    client
  );
  if (created.rows[0]) return created.rows[0];
  const raced = await query(
    "SELECT id, currency FROM carts WHERE customer_id = $1 AND status = 'active'",
    [customerId],
    client
  );
  if (!raced.rows[0]) throw errors.internal();
  return raced.rows[0];
}
async function getCart(customerId, client = pool) {
  const cart = await ensureCart(customerId, client);
  const items = await query(
    `SELECT s.sku, p.name, ci.quantity, s.unit_price_minor, s.stock
       FROM cart_items ci
       JOIN skus s ON s.id = ci.sku_id
       JOIN products p ON p.id = s.product_id
      WHERE ci.cart_id = $1
      ORDER BY ci.created_at`,
    [cart.id],
    client
  );
  return {
    id: cart.id,
    currency: cart.currency.trim(),
    items: items.rows.map((row) => ({
      sku: row.sku,
      name: row.name,
      quantity: row.quantity,
      unitPriceMinor: row.unit_price_minor,
      available: row.stock >= row.quantity
    }))
  };
}
async function setQuantity(customerId, sku, quantity) {
  return withTransaction(async (client) => {
    const cart = await ensureCart(customerId, client);
    const productSku = await getSku(sku, client, true);
    if (!productSku.active) throw errors.inventoryChanged();
    const available = productSku.stock;
    const capped = Math.min(quantity, productSku.max_quantity, Math.max(0, available));
    if (quantity > productSku.max_quantity) {
      throw errors.validation(`Maximum quantity is ${productSku.max_quantity}.`, "quantity");
    }
    if (quantity > available) throw errors.inventoryChanged();
    if (capped <= 0) {
      await query("DELETE FROM cart_items WHERE cart_id = $1 AND sku_id = $2", [cart.id, productSku.id], client);
    } else {
      await query(
        `INSERT INTO cart_items (cart_id, sku_id, quantity) VALUES ($1, $2, $3)
         ON CONFLICT (cart_id, sku_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()`,
        [cart.id, productSku.id, capped],
        client
      );
    }
    await query("UPDATE carts SET updated_at = now() WHERE id = $1", [cart.id], client);
    return getCart(customerId, client);
  });
}
async function addDefaultItem(customerId, client = pool) {
  const cart = await ensureCart(customerId, client);
  const sku = await getSku(FEATURED_SKU, client);
  await query(
    `INSERT INTO cart_items (cart_id, sku_id, quantity) VALUES ($1, $2, 1)
     ON CONFLICT (cart_id, sku_id) DO NOTHING`,
    [cart.id, sku.id],
    client
  );
}
async function ensureStarterCart(customerId, client = pool) {
  const active = await query(
    "SELECT id FROM carts WHERE customer_id = $1 AND status = 'active'",
    [customerId],
    client
  );
  if (!active.rows[0]) await addDefaultItem(customerId, client);
}
async function mergeGuestCart(guestCustomerId, targetCustomerId, client) {
  if (guestCustomerId === targetCustomerId) return;
  const guestCart = await query(
    "SELECT id FROM carts WHERE customer_id = $1 AND status = 'active'",
    [guestCustomerId],
    client
  );
  const guestCartId = guestCart.rows[0]?.id;
  if (!guestCartId) return;
  const targetCart = await ensureCart(targetCustomerId, client);
  const items = await query(
    "SELECT sku_id, quantity FROM cart_items WHERE cart_id = $1",
    [guestCartId],
    client
  );
  for (const item of items.rows) {
    const existing = await query(
      "SELECT id, quantity FROM cart_items WHERE cart_id = $1 AND sku_id = $2",
      [targetCart.id, item.sku_id],
      client
    );
    const sku = await query(
      "SELECT stock, max_quantity FROM skus WHERE id = $1 FOR UPDATE",
      [item.sku_id],
      client
    );
    const limit = Math.min(sku.rows[0]?.max_quantity ?? 10, sku.rows[0]?.stock ?? 0);
    const quantity = Math.min(limit, (existing.rows[0]?.quantity ?? 0) + item.quantity);
    if (quantity <= 0) continue;
    if (existing.rows[0]) {
      await query("UPDATE cart_items SET quantity = $1, updated_at = now() WHERE id = $2", [quantity, existing.rows[0].id], client);
    } else {
      await query("INSERT INTO cart_items (cart_id, sku_id, quantity) VALUES ($1, $2, $3)", [targetCart.id, item.sku_id, quantity], client);
    }
  }
  await query("UPDATE carts SET status = 'abandoned', updated_at = now() WHERE id = $1", [guestCartId], client);
}
async function markCartOrdered(cartId, client) {
  await query("UPDATE carts SET status = 'ordered', updated_at = now() WHERE id = $1", [cartId], client);
}

// src/modules/identity/service.ts
async function carryOverGuestCart(guestCustomerId, targetCustomerId, client) {
  await mergeGuestCart(guestCustomerId, targetCustomerId, client);
  const cart = await getCart(targetCustomerId, client);
  if (!cart.items.length) await addDefaultItem(targetCustomerId, client);
}
function publicUser(session) {
  return {
    id: session.customerId,
    name: session.name,
    email: session.email,
    isGuest: session.isGuest,
    csrfToken: session.csrfToken
  };
}
async function issueSession(customerId, res, client = pool) {
  const token = randomToken(32);
  const csrfNonce = randomToken(24);
  const csrfToken = signCsrf(csrfNonce);
  const inserted = await query(
    `INSERT INTO sessions (customer_id, token_hash, csrf_token, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' hours')::interval)
     RETURNING id`,
    [customerId, tokenHash(token), csrfToken, String(config.sessionTtlHours)],
    client
  );
  const customer = await query("SELECT id, name, email, is_guest FROM customers WHERE id = $1", [customerId], client);
  const row = customer.rows[0];
  if (!row) throw errors.internal();
  const session = {
    sessionId: inserted.rows[0].id,
    customerId: row.id,
    csrfToken,
    name: row.name,
    email: row.email,
    isGuest: row.is_guest
  };
  setSessionCookies(res, token, csrfToken);
  return session;
}
async function revokeSession(session, client = pool) {
  if (!session) return;
  await query("UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL", [session.sessionId], client);
}
async function ensureCsrf(req, res) {
  const existing = req.cookies?.checkout_csrf;
  if (existing) return existing;
  const token = signCsrf(randomToken(24));
  res.cookie("checkout_csrf", token, {
    httpOnly: false,
    secure: config.cookieSecure,
    sameSite: "lax",
    path: "/",
    domain: config.cookieDomain,
    maxAge: config.sessionTtlHours * 60 * 60 * 1e3
  });
  return token;
}
async function createGuest(res) {
  const session = await withTransaction(async (client) => {
    const customer = await query(
      `INSERT INTO customers (email, name, is_guest) VALUES (NULL, 'Guest', true) RETURNING id`,
      [],
      client
    );
    const customerId = customer.rows[0].id;
    const created = await issueSession(customerId, res, client);
    await addDefaultItem(customerId, client);
    return created;
  });
  audit("guest_created", { customerId: session.customerId });
  return publicUser(session);
}
async function register(input, existing, res) {
  const email = input.email.toLowerCase();
  const session = await withTransaction(async (client) => {
    const duplicate = await query("SELECT 1 FROM customers WHERE lower(email) = $1", [email], client);
    if (duplicate.rowCount) {
      throw new AppError({
        code: "CONFLICT",
        message: "An account with that email may already exist. Sign in instead.",
        status: 409
      });
    }
    const passwordHash = await hashPassword(input.password);
    const customer = await query(
      `INSERT INTO customers (email, name, is_guest)
       VALUES ($1, split_part($1, '@', 1), false) RETURNING id, name`,
      [email],
      client
    );
    const customerId = customer.rows[0].id;
    await query(
      `INSERT INTO identities (customer_id, password_hash, password_params)
       VALUES ($1, $2, $3::jsonb)`,
      [customerId, passwordHash, JSON.stringify({ algorithm: "scrypt", N: 16384, r: 8, p: 1 })],
      client
    );
    if (existing?.isGuest) await carryOverGuestCart(existing.customerId, customerId, client);
    else await addDefaultItem(customerId, client);
    await revokeSession(existing, client);
    return issueSession(customerId, res, client);
  });
  audit("registered", { customerId: session.customerId });
  return publicUser(session);
}
async function login(input, existing, ipHash, res) {
  const email = input.email.toLowerCase();
  const generic = () => errors.unauthorized("Invalid email or password.");
  const attempts = await query(
    `SELECT count(*)::text AS count FROM login_attempts
      WHERE email_hash = $1 AND created_at > now() - interval '15 minutes'`,
    [emailIndex(email)]
  );
  if (Number(attempts.rows[0]?.count ?? 0) >= 10) throw errors.rateLimited();
  const row = await query(
    `SELECT i.customer_id, i.password_hash, i.failed_attempts, i.locked_until
       FROM identities i JOIN customers c ON c.id = i.customer_id
      WHERE lower(c.email) = $1`,
    [email]
  );
  const identity = row.rows[0];
  if (!identity || identity.locked_until && identity.locked_until > /* @__PURE__ */ new Date()) {
    await query(
      "INSERT INTO login_attempts (email_hash, ip_hash, succeeded) VALUES ($1, $2, false)",
      [emailIndex(email), ipHash]
    );
    throw generic();
  }
  const valid = await verifyPassword(input.password, identity.password_hash);
  if (!valid) {
    await withTransaction(async (client) => {
      const failures = identity.failed_attempts + 1;
      await query(
        `UPDATE identities SET failed_attempts = $2,
           locked_until = CASE WHEN $2 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
         WHERE customer_id = $1`,
        [identity.customer_id, failures],
        client
      );
      await query("INSERT INTO login_attempts (email_hash, ip_hash, succeeded) VALUES ($1, $2, false)", [emailIndex(email), ipHash], client);
    });
    throw generic();
  }
  const session = await withTransaction(async (client) => {
    await query("UPDATE identities SET failed_attempts = 0, locked_until = NULL WHERE customer_id = $1", [identity.customer_id], client);
    await query("INSERT INTO login_attempts (email_hash, ip_hash, succeeded) VALUES ($1, $2, true)", [emailIndex(email), ipHash], client);
    if (existing?.isGuest) await carryOverGuestCart(existing.customerId, identity.customer_id, client);
    await revokeSession(existing, client);
    return issueSession(identity.customer_id, res, client);
  });
  audit("login", { customerId: session.customerId });
  return publicUser(session);
}
async function logout(session, res) {
  await revokeSession(session);
  clearSessionCookies(res);
  audit("logout", { customerId: session?.customerId });
}
async function requestRecovery(input) {
  const email = input.email.toLowerCase();
  const customer = await query("SELECT id FROM customers WHERE lower(email) = $1", [email]);
  if (customer.rows[0]) {
    const token = randomToken(32);
    await withTransaction(async (client) => {
      await query(
        `INSERT INTO recovery_tokens (customer_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '1 hour')`,
        [customer.rows[0].id, tokenHash(token)],
        client
      );
      await query(
        `INSERT INTO outbox_emails (recipient, subject, body, purpose)
         VALUES ($1, 'Reset your password',
                 $2, 'recovery')`,
        [email, `${config.publicWebOrigin}/reset-password?token=${token}`],
        client
      );
    });
  }
}
async function resetPassword(input) {
  const hash = tokenHash(input.token);
  const token = await query(
    `SELECT id, customer_id FROM recovery_tokens
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [hash]
  );
  if (!token.rows[0]) throw errors.validation("That reset link is invalid or has expired.", "token");
  const passwordHash = await hashPassword(input.password);
  await withTransaction(async (client) => {
    await query("UPDATE recovery_tokens SET used_at = now() WHERE id = $1", [token.rows[0].id], client);
    await query(
      `INSERT INTO identities (customer_id, password_hash, password_params)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (customer_id) DO UPDATE SET password_hash = EXCLUDED.password_hash,
         password_params = EXCLUDED.password_params, failed_attempts = 0, locked_until = NULL`,
      [token.rows[0].customer_id, passwordHash, JSON.stringify({ algorithm: "scrypt", N: 16384, r: 8, p: 1 })],
      client
    );
    await query("UPDATE sessions SET revoked_at = now() WHERE customer_id = $1", [token.rows[0].customer_id], client);
  });
  audit("password_reset", { customerId: token.rows[0].customer_id });
}

// src/seed.ts
var POLICY_VERSION = "2026-11-26-draft";

// src/modules/compliance/service.ts
var POLICY_KEYS = ["terms", "privacy", "delivery", "returns", "refund"];
function gate(id, label, status, detail) {
  return { id, label, status, detail };
}
function isPlaceholder(value) {
  return !value || /placeholder|example\.invalid|draft/i.test(value);
}
async function getCompliance() {
  const result = await query("SELECT document FROM compliance_config WHERE singleton = true");
  const raw = result.rows[0]?.document;
  if (!raw) throw errors.internal();
  const policy = await query(
    "SELECT document, reviewed_by FROM policy_versions WHERE version = $1",
    [raw.policyVersion ?? POLICY_VERSION]
  );
  const taxCoverage = await query(
    `SELECT count(DISTINCT country_code)::text AS count FROM tax_rules
      WHERE active AND country_code = ANY($1::char(2)[])`,
    [raw.supportedCountries]
  );
  const covered = Number(taxCoverage.rows[0]?.count ?? 0);
  const taxVerified = covered >= raw.supportedCountries.length;
  const launchGates = [
    gate(
      "legal-entity",
      "Seller legal identity",
      isPlaceholder(raw.sellerLegalEntity) ? "pending" : "verified",
      isPlaceholder(raw.sellerLegalEntity) ? "Replace the placeholder legal entity." : "Legal entity supplied; verify registration details externally."
    ),
    gate(
      "jurisdictions",
      "Supported jurisdictions and currencies",
      raw.supportedCountries.length > 0 && raw.currencies.length > 0 ? "verified" : "pending",
      `${raw.supportedCountries.length} countries, ${raw.currencies.length} currencies configured.`
    ),
    gate(
      "tax",
      "Tax rules coverage",
      taxVerified ? "verified" : "pending",
      `${covered} of ${raw.supportedCountries.length} supported countries have active tax rules.`
    ),
    gate(
      "policies",
      "Terms, Privacy, Delivery, Returns, Refund",
      POLICY_KEYS.every((key) => Boolean(raw.policies?.[key])) && policy.rows[0]?.reviewed_by !== "UNREVIEWED" ? "verified" : "pending",
      "Policy links exist; legal review of text is still required."
    ),
    gate(
      "privacy",
      "Controller, contact and retention",
      isPlaceholder(raw.privacyController) || isPlaceholder(raw.privacyContact) ? "pending" : "verified",
      "Retention periods are configured; confirm with privacy counsel."
    ),
    gate(
      "restrictions",
      "Age/product restrictions and cookie inventory",
      raw.restrictions && Array.isArray(raw.cookies) && raw.cookies.length > 0 ? "verified" : "pending",
      "Configuration present; confirm with counsel and consent platform."
    ),
    gate(
      "payment-provider",
      "Payment provider adapter",
      config.providerMode === "test" ? "unsupported" : "pending",
      "No live or sandbox vendor adapter is registered; only the signed test adapter exists."
    ),
    gate(
      "external-review",
      "Documented external sign-off",
      raw.reviewedAt && raw.reviewedBy ? "verified" : "pending",
      "Set reviewed_at and reviewed_by only after qualified review."
    ),
    gate(
      "consumer-law",
      "Consumer-law review",
      "unsupported",
      "Requires qualified review of cancellation, returns and warranty terms."
    ),
    gate(
      "fraud-aml",
      "Fraud, AML and sanctions review",
      "unsupported",
      "Requires qualified review and configured screening provider."
    ),
    gate(
      "accessibility",
      "WCAG 2.2 AA audit",
      "unsupported",
      "Automated checks and manual keyboard/screen-reader review are outstanding."
    )
  ];
  return {
    sellerLegalEntity: raw.sellerLegalEntity,
    supportedCountries: raw.supportedCountries,
    currencies: raw.currencies,
    b2bMode: raw.b2bMode,
    taxInclusive: raw.taxInclusive,
    policies: raw.policies,
    policyVersion: raw.policyVersion,
    privacyController: raw.privacyController,
    privacyContact: raw.privacyContact,
    retention: raw.retention,
    restrictions: raw.restrictions,
    cookies: raw.cookies,
    paymentMethods: raw.paymentMethods,
    providerMode: config.providerMode,
    liveCheckoutEnabled: raw.liveCheckoutEnabled,
    reviewedAt: raw.reviewedAt,
    reviewedBy: raw.reviewedBy,
    launchGates
  };
}
function assertLiveCheckoutAllowed(compliance) {
  if (!compliance.liveCheckoutEnabled) throw errors.launchGateBlocked();
  if (compliance.launchGates.some((item) => item.status !== "verified")) {
    throw errors.launchGateBlocked();
  }
}
function assertTestCheckoutAllowed(compliance) {
  if (compliance.providerMode !== "test" || !config.checkoutTestMode) {
    assertLiveCheckoutAllowed(compliance);
  }
  if (!compliance.paymentMethods.length) throw errors.launchGateBlocked();
}
async function getPolicyDocument(key) {
  if (!POLICY_KEYS.includes(key)) throw errors.notFound("Policy not found.");
  const compliance = await getCompliance();
  const result = await query(
    "SELECT document, reviewed_by FROM policy_versions WHERE version = $1",
    [compliance.policyVersion]
  );
  const row = result.rows[0];
  if (!row) throw errors.notFound("Policy version not found.");
  return {
    title: key.charAt(0).toUpperCase() + key.slice(1),
    text: row.document[key] ?? "Policy text not available.",
    version: compliance.policyVersion,
    reviewed: row.reviewed_by !== "UNREVIEWED"
  };
}
async function createPrivacyRequest(input, customerId) {
  const result = await query(
    `INSERT INTO privacy_requests (customer_id, type, contact, details)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [customerId, input.type, input.contact, input.details]
  );
  return { id: result.rows[0].id };
}
async function exportCustomerData(customerId) {
  const customer = await query(
    "SELECT id, email, name FROM customers WHERE id = $1",
    [customerId]
  );
  const row = customer.rows[0];
  if (!row) throw errors.notFound();
  const carts = await query("SELECT id, currency, status, created_at FROM carts WHERE customer_id = $1", [customerId]);
  const orders = await query("SELECT id, number, status, total_minor, currency, created_at FROM orders WHERE customer_id = $1", [customerId]);
  const consents = await query("SELECT kind, version, granted, recorded_at FROM consents WHERE customer_id = $1", [customerId]);
  return {
    customerId: row.id,
    email: row.email,
    name: row.name,
    carts: carts.rows,
    orders: orders.rows,
    consents: consents.rows,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function anonymizeCustomer(customerId) {
  const token = randomToken(8);
  await query(
    `UPDATE customers
        SET email = NULL, name = 'Deleted customer', is_guest = true,
            anonymized_at = now(), updated_at = now()
      WHERE id = $1`,
    [customerId]
  );
  await query("UPDATE addresses SET line1 = '[redacted]', line2 = '[redacted]', city = '[redacted]', postal_code = '[redacted]' WHERE customer_id = $1", [customerId]);
  await query("DELETE FROM sessions WHERE customer_id = $1", [customerId]);
  await query("DELETE FROM recovery_tokens WHERE customer_id = $1", [customerId]);
  await query(
    `INSERT INTO audit_log (actor_id, action, target, metadata)
     VALUES ($1, 'privacy_anonymize', $2, $3::jsonb)`,
    [customerId, customerId, JSON.stringify({ reference: tokenHash(token) })]
  );
}

// src/modules/shipping/service.ts
function normalizeAddress(input) {
  return {
    line1: input.line1.trim(),
    line2: input.line2.trim(),
    city: input.city.trim(),
    postalCode: input.postalCode.trim().toUpperCase(),
    countryCode: input.countryCode.trim().toUpperCase()
  };
}
function validateAddress(input, compliance) {
  const address = normalizeAddress(input);
  if (!compliance.supportedCountries.includes(address.countryCode)) {
    throw errors.validation("We do not currently ship to that country.", "countryCode");
  }
  if (!/^[A-Z0-9][A-Z0-9 -]{1,18}$/.test(address.postalCode)) {
    throw errors.validation("Enter a valid postal code.", "postalCode");
  }
  return address;
}
async function getShippingOptions(destination, client = pool) {
  const rows = await query(
    `SELECT r.method, r.label, r.price_minor, r.currency, r.eta_min_days, r.eta_max_days
       FROM shipping_rates r
       JOIN shipping_zones z ON z.id = r.zone_id
      WHERE z.country_code = $1 AND z.active AND r.active
      ORDER BY r.price_minor`,
    [destination.countryCode.trim().toUpperCase()],
    client
  );
  return rows.rows.map((row) => ({
    method: row.method,
    label: row.label,
    priceMinor: row.price_minor,
    currency: row.currency.trim(),
    etaMinDays: row.eta_min_days,
    etaMaxDays: row.eta_max_days,
    available: true
  }));
}
async function getRate(address, method, client) {
  const options = await getShippingOptions(address, client);
  const option = options.find((item) => item.method === method);
  if (!option) throw errors.validation("That shipping method is not available for this destination.", "shippingMethod");
  return {
    priceMinor: option.priceMinor,
    currency: option.currency,
    etaMinDays: option.etaMinDays,
    etaMaxDays: option.etaMaxDays
  };
}

// src/modules/pricing/service.ts
var ROUNDING_RULE = "HALF_UP_PER_LINE_MINOR_UNITS";
function roundHalfUp(numerator, denominator) {
  if (denominator <= 0) throw new Error("Invalid denominator");
  return Math.floor((numerator + denominator / 2) / denominator);
}
async function mapQuote(row, token, client) {
  const lines = await query(
    "SELECT kind, label, amount_minor FROM quote_lines WHERE quote_id = $1 ORDER BY position",
    [row.id],
    client
  );
  return {
    id: row.id,
    cartId: row.cart_id,
    version: row.version,
    expiresAt: new Date(row.expires_at).toISOString(),
    currency: row.currency.trim(),
    taxInclusive: row.tax_inclusive,
    roundingRule: row.rounding_rule,
    sku: row.sku,
    quantity: row.quantity,
    unitPriceMinor: row.unit_price_minor,
    availability: row.availability,
    discountMinor: row.discount_minor,
    promotionCode: row.promotion_code,
    taxMinor: row.tax_minor,
    shippingMinor: row.shipping_minor,
    shippingMethod: row.shipping_method,
    subtotalMinor: row.subtotal_minor,
    totalMinor: row.total_minor,
    lines: lines.rows.map((line) => ({
      kind: line.kind,
      label: line.label,
      amountMinor: line.amount_minor
    })),
    address: row.address,
    quoteToken: token
  };
}
async function computeDiscount(code, subtotalMinor, client) {
  if (!code) return { discountMinor: 0, promotion: null };
  const result = await query(
    `SELECT id, kind, value_bps, value_minor, min_subtotal_minor, max_discount_minor,
            usage_limit, ends_at, description
       FROM promotions WHERE upper(code) = upper($1) AND active AND starts_at <= now()
        AND (ends_at IS NULL OR ends_at > now())`,
    [code],
    client
  );
  const promotion = result.rows[0];
  if (!promotion || subtotalMinor < promotion.min_subtotal_minor) {
    return {
      discountMinor: 0,
      promotion: { code, valid: false, description: "That code is not valid for this order.", discountMinor: 0 }
    };
  }
  if (promotion.usage_limit !== null) {
    const usage = await query(
      "SELECT count(*)::text AS count FROM promotion_redemptions WHERE promotion_id = $1",
      [promotion.id],
      client
    );
    if (Number(usage.rows[0]?.count ?? 0) >= promotion.usage_limit) {
      return {
        discountMinor: 0,
        promotion: { code, valid: false, description: "That code has reached its usage limit.", discountMinor: 0 }
      };
    }
  }
  let discount = promotion.kind === "percent" ? roundHalfUp(subtotalMinor * (promotion.value_bps ?? 0), 1e4) : promotion.value_minor ?? 0;
  if (promotion.max_discount_minor !== null) discount = Math.min(discount, promotion.max_discount_minor);
  discount = Math.min(discount, subtotalMinor);
  return {
    discountMinor: discount,
    promotion: { code: code.toUpperCase(), valid: true, description: promotion.description, discountMinor: discount }
  };
}
async function computeTax(countryCode, taxableMinor, quantity, taxInclusive, client) {
  const result = await query(
    `SELECT kind, rate_bps, amount_minor FROM tax_rules
      WHERE country_code = $1 AND active AND valid_from <= now()
      ORDER BY valid_from DESC LIMIT 1`,
    [countryCode],
    client
  );
  const rule = result.rows[0];
  if (!rule) throw errors.validation("Tax rules are not configured for that destination.", "countryCode");
  if (rule.kind === "flat_per_unit") return (rule.amount_minor ?? 0) * quantity;
  const bps = rule.rate_bps ?? 0;
  if (!taxInclusive) return roundHalfUp(taxableMinor * bps, 1e4);
  return roundHalfUp(taxableMinor * bps, 1e4 + bps);
}
async function createQuote(session, input) {
  return withTransaction(async (client) => {
    const compliance = await getCompliance();
    const address = validateAddress(input.address, compliance);
    const cart = await getCart(session.customerId, client);
    const item = cart.items[0];
    if (!item) throw errors.validation("Your cart is empty.", "quantity");
    if (!compliance.currencies.includes(cart.currency)) {
      throw errors.validation("That currency is not configured for checkout.", "currency");
    }
    const sku = await getSku(item.sku, client, true);
    if (!sku.active || sku.stock < item.quantity) throw errors.inventoryChanged();
    if (sku.currency !== cart.currency) {
      throw errors.validation("The product currency does not match your cart.", "currency");
    }
    const shipping = await getRate(address, input.shippingMethod, client);
    if (shipping.currency !== cart.currency) {
      throw errors.validation("Shipping is not available in your cart currency.", "currency");
    }
    const subtotal = item.quantity * sku.unit_price_minor;
    const { discountMinor, promotion } = await computeDiscount(input.promotionCode, subtotal, client);
    const taxable = subtotal - discountMinor;
    const taxMinor = await computeTax(
      address.countryCode,
      taxable,
      item.quantity,
      compliance.taxInclusive,
      client
    );
    const totalMinor = compliance.taxInclusive ? taxable + shipping.priceMinor : taxable + taxMinor + shipping.priceMinor;
    const token = randomToken(24);
    const inserted = await query(
      `INSERT INTO quotes (
         cart_id, customer_id, token_hash, address, shipping_method, currency, tax_inclusive,
         rounding_rule, sku, quantity, unit_price_minor, availability,
         subtotal_minor, discount_minor, tax_minor, shipping_minor, total_minor,
         promotion_code, expires_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
         now() + ($19 || ' minutes')::interval)
       RETURNING *`,
      [
        cart.id,
        session.customerId,
        tokenHash(token),
        JSON.stringify(address),
        input.shippingMethod,
        cart.currency,
        compliance.taxInclusive,
        ROUNDING_RULE,
        sku.sku,
        item.quantity,
        sku.unit_price_minor,
        sku.stock <= sku.low_stock_threshold ? "low_stock" : "in_stock",
        subtotal,
        discountMinor,
        taxMinor,
        shipping.priceMinor,
        totalMinor,
        input.promotionCode?.toUpperCase() ?? null,
        String(config.quoteTtlMinutes)
      ],
      client
    );
    const row = inserted.rows[0];
    const lines = [
      ["subtotal", "Sub total", subtotal],
      ["discount", `Discount${discountMinor ? "" : " (none)"}`, -discountMinor],
      ["tax", compliance.taxInclusive ? "Tax (included)" : "Tax", taxMinor],
      ["shipping", shipping.priceMinor === 0 ? "Free delivery" : "Shipping", shipping.priceMinor],
      ["total", "Total", totalMinor]
    ];
    for (const [index, [kind, label, amount]] of lines.entries()) {
      await query(
        "INSERT INTO quote_lines (quote_id, kind, label, amount_minor, position) VALUES ($1,$2,$3,$4,$5)",
        [row.id, kind, label, amount, index],
        client
      );
    }
    audit("quote_created", { customerId: session.customerId, orderId: row.id, amountMinor: totalMinor });
    return { quote: await mapQuote(row, token, client), promotion };
  });
}
async function getQuote(quoteId, token, session, client = pool) {
  const result = await query(
    `SELECT * FROM quotes WHERE id = $1 AND customer_id = $2
       AND token_hash = $3 AND expires_at > now()`,
    [quoteId, session.customerId, tokenHash(token)],
    client
  );
  const row = result.rows[0];
  if (!row) throw errors.quoteExpired();
  return mapQuote(row, token, client);
}

// src/modules/bootstrap/routes.ts
var bootstrapRouter = Router();
function defaultAddress(country) {
  const placeholders = {
    GB: { city: "London", postalCode: "SW1A 1AA" },
    US: { city: "New York", postalCode: "10001" },
    DE: { city: "Berlin", postalCode: "10115" },
    FR: { city: "Paris", postalCode: "75001" }
  };
  return {
    line1: "123 Electric Avenue",
    line2: "",
    city: placeholders[country]?.city ?? "City",
    postalCode: placeholders[country]?.postalCode ?? "10000",
    countryCode: country
  };
}
bootstrapRouter.get("/bootstrap", asyncRoute(async (req, res) => {
  const compliance = await getCompliance();
  let session = await loadSession(req);
  let message = null;
  if (!session) {
    const user = await createGuest(res);
    session = {
      sessionId: "",
      customerId: user.id,
      csrfToken: user.csrfToken,
      name: user.name,
      email: user.email,
      isGuest: user.isGuest
    };
    message = "A guest session was created. Sign in or register at any time to keep your cart.";
  } else {
    await ensureCsrf(req, res);
  }
  const active = session;
  const country = compliance.supportedCountries[0] ?? "GB";
  const address = defaultAddress(country);
  const options = await getShippingOptions(address);
  const product = await getFeaturedProduct();
  await ensureStarterCart(active.customerId);
  const cart = await getCart(active.customerId);
  let quote = null;
  try {
    if (cart.items.length) {
      quote = (await createQuote(active, {
        address,
        shippingMethod: options[0]?.method ?? "standard"
      })).quote;
    }
  } catch {
    message = "Prices will appear once shipping is selected.";
  }
  const payload = {
    user: {
      id: active.customerId,
      name: active.name,
      email: active.email,
      isGuest: active.isGuest,
      csrfToken: active.csrfToken
    },
    product,
    cart,
    shippingOptions: options,
    quote,
    compliance,
    message
  };
  res.json(payload);
}));

// src/modules/identity/routes.ts
import { Router as Router2 } from "express";
import {
  loginRequestSchema,
  recoveryRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema
} from "@checkout/shared";
var identityRouter = Router2();
identityRouter.get("/session", asyncRoute(async (req, res) => {
  const session = await loadSession(req);
  const user = session ? {
    id: session.customerId,
    name: session.name,
    email: session.email,
    isGuest: session.isGuest,
    csrfToken: session.csrfToken
  } : null;
  res.json({ user });
}));
identityRouter.post("/guest", asyncRoute(async (_req, res) => {
  const user = await createGuest(res);
  res.status(201).json({ user });
}));
identityRouter.post("/register", asyncRoute(async (req, res) => {
  const input = parseBody(registerRequestSchema, req.body);
  const user = await register(input, await loadSession(req), res);
  res.status(201).json({ user });
}));
identityRouter.post("/login", asyncRoute(async (req, res) => {
  const input = parseBody(loginRequestSchema, req.body);
  const ipHash = hmac(req.ip ?? "unknown");
  const user = await login(input, await loadSession(req), ipHash, res);
  res.json({ user });
}));
identityRouter.post("/logout", asyncRoute(async (req, res) => {
  await logout(requireSession(await loadSession(req)), res);
  res.json({ ok: true });
}));
identityRouter.post("/recovery", asyncRoute(async (req, res) => {
  const input = parseBody(recoveryRequestSchema, req.body);
  await requestRecovery(input);
  res.json({ ok: true, message: "If an account exists, a reset link has been queued." });
}));
identityRouter.post("/reset-password", asyncRoute(async (req, res) => {
  const input = parseBody(resetPasswordRequestSchema, req.body);
  await resetPassword(input);
  res.json({ ok: true });
}));

// src/modules/catalog/routes.ts
import { Router as Router3 } from "express";
var catalogRouter = Router3();
catalogRouter.get("/product", asyncRoute(async (_req, res) => {
  res.json({ product: await getFeaturedProduct() });
}));

// src/modules/cart/routes.ts
import { Router as Router4 } from "express";
import { setQuantityRequestSchema } from "@checkout/shared";
var cartRouter = Router4();
cartRouter.get("/cart", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  res.json({ cart: await getCart(session.customerId) });
}));
cartRouter.put("/cart/quantity", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  const input = parseBody(setQuantityRequestSchema, req.body);
  res.json({ cart: await setQuantity(session.customerId, input.sku, input.quantity) });
}));

// src/modules/shipping/routes.ts
import { Router as Router5 } from "express";
import { addressSchema } from "@checkout/shared";
var shippingRouter = Router5();
shippingRouter.get("/shipping/options", asyncRoute(async (req, res) => {
  const country = String(req.query.country ?? "").trim().toUpperCase();
  const compliance = await getCompliance();
  if (!compliance.supportedCountries.includes(country)) {
    throw errors.validation("We do not currently ship to that country.", "country");
  }
  res.json({ options: await getShippingOptions({ countryCode: country }) });
}));
shippingRouter.post("/shipping/address", asyncRoute(async (req, res) => {
  const input = parseBody(addressSchema, req.body);
  const address = validateAddress(input, await getCompliance());
  res.json({ address, options: await getShippingOptions(address), message: "Destination is serviceable." });
}));

// src/modules/pricing/routes.ts
import { Router as Router6 } from "express";
import {
  createQuoteRequestSchema
} from "@checkout/shared";
var pricingRouter = Router6();
pricingRouter.post("/pricing/quote", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  const input = parseBody(createQuoteRequestSchema, req.body);
  res.json(await createQuote(session, input));
}));
pricingRouter.post("/pricing/promotion", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  const input = parseBody(
    createQuoteRequestSchema.extend({ promotionCode: createQuoteRequestSchema.shape.promotionCode.refine((value) => Boolean(value), "Enter a code.") }),
    req.body
  );
  res.json(await createQuote(session, { ...input, promotionCode: input.promotionCode }));
}));
pricingRouter.get("/pricing/quote/:id", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  const token = String(req.query.token ?? "");
  res.json({ quote: await getQuote(String(req.params.id), token, session) });
}));

// src/modules/orders/routes.ts
import { Router as Router7 } from "express";
import {
  createOrderRequestSchema,
  refundRequestSchema
} from "@checkout/shared";

// src/lib/idempotency.ts
import { createHash as createHash2 } from "crypto";
function readIdempotencyKey(req) {
  const key = req.header("idempotency-key");
  if (!key || !/^[A-Za-z0-9_-]{12,100}$/.test(key)) {
    throw errors.validation("A valid Idempotency-Key header is required.", "idempotency-key");
  }
  return key;
}
async function runIdempotent(options) {
  const keyHash = tokenHash(options.key);
  const requestHash = createHash2("sha256").update(JSON.stringify(options.request ?? null)).digest("hex");
  return withTransaction(async (client) => {
    const inserted = await query(
      `INSERT INTO idempotency_keys (key_hash, customer_id, scope, request_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (customer_id, scope, key_hash) DO NOTHING
       RETURNING id`,
      [keyHash, options.customerId, options.scope, requestHash],
      client
    );
    if (!inserted.rowCount) {
      const existing = await query(
        `SELECT request_hash, status, response FROM idempotency_keys
          WHERE customer_id = $1 AND scope = $2 AND key_hash = $3`,
        [options.customerId, options.scope, keyHash],
        client
      );
      const row = existing.rows[0];
      if (!row || row.request_hash !== requestHash) throw errors.idempotencyConflict();
      if (row.status !== "completed" || row.response === null) {
        throw new AppError({
          code: "CONFLICT",
          message: "A duplicate request is still being processed. Retry shortly.",
          status: 409,
          retryable: true
        });
      }
      return { value: row.response, replayed: true };
    }
    const value = await options.work(client);
    await query(
      `UPDATE idempotency_keys SET status = 'completed', response = $1::jsonb
        WHERE customer_id = $2 AND scope = $3 AND key_hash = $4`,
      [JSON.stringify(value), options.customerId, options.scope, keyHash],
      client
    );
    return { value, replayed: false };
  });
}

// src/modules/orders/service.ts
function sameAddress(a, b) {
  return a.line1 === b.line1 && a.line2 === b.line2 && a.city === b.city && a.postalCode === b.postalCode && a.countryCode === b.countryCode;
}
function orderNumber() {
  return `ORD-${(/* @__PURE__ */ new Date()).getUTCFullYear()}-${randomToken(5).replace(/[^A-Za-z0-9]/g, "A").toUpperCase().slice(0, 7)}`;
}
async function mapOrder(row, client) {
  const items = await query(
    "SELECT sku, name, quantity, unit_price_minor, line_total_minor FROM order_items WHERE order_id = $1 ORDER BY id",
    [row.id],
    client
  );
  const address = await query(
    "SELECT line1, line2, city, postal_code, country_code FROM order_addresses WHERE order_id = $1",
    [row.id],
    client
  );
  const consents = await query(
    "SELECT kind, version, granted, recorded_at FROM consents WHERE order_id = $1 ORDER BY id",
    [row.id],
    client
  );
  const payment = await query(
    "SELECT provider_session_id, status, brand, last4, created_at FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1",
    [row.id],
    client
  );
  const compliance = await getCompliance();
  const transaction = payment.rows[0];
  const paid = row.status === "paid" || row.status === "refunded" || row.status === "disputed";
  const receipt = paid ? {
    merchant: compliance.sellerLegalEntity,
    orderNumber: row.number,
    transactionReference: transaction?.provider_session_id ?? null,
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    currency: row.currency.trim(),
    totalMinor: row.total_minor,
    paymentBrand: transaction?.brand ?? null,
    last4: transaction?.last4 ?? null,
    policyVersion: row.policy_version
  } : null;
  const addressRow = address.rows[0];
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    paymentStatus: row.payment_status,
    fulfillmentStatus: row.fulfillment_status,
    currency: row.currency.trim(),
    totalMinor: row.total_minor,
    createdAt: new Date(row.created_at).toISOString(),
    confirmationUrl: `${config.publicWebOrigin}/?order=${row.id}`,
    items: items.rows.map((item) => ({
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      unitPriceMinor: item.unit_price_minor,
      lineTotalMinor: item.line_total_minor
    })),
    address: addressRow ? {
      line1: addressRow.line1,
      line2: addressRow.line2,
      city: addressRow.city,
      postalCode: addressRow.postal_code,
      countryCode: addressRow.country_code
    } : { line1: "", line2: "", city: "", postalCode: "", countryCode: "" },
    consents: (() => {
      const necessary = consents.rows.find((row2) => row2.kind === "necessary");
      if (!necessary) return [];
      const marketing = consents.rows.find((row2) => row2.kind === "marketing");
      const record = {
        necessary: true,
        marketing: marketing?.granted ?? false,
        version: necessary.version,
        recordedAt: new Date(necessary.recorded_at).toISOString()
      };
      return [record];
    })(),
    receipt,
    message: null
  };
}
async function createOrder(input, session, client) {
  const quote = await getQuote(input.quoteId, input.quoteToken, session, client);
  if (quote.version !== input.quoteVersion) throw errors.quoteExpired();
  if (quote.shippingMethod !== input.shippingMethod) throw errors.validation("Shipping method changed. Review your total.", "shippingMethod");
  if (!sameAddress(quote.address, input.address)) {
    throw errors.validation("Address changed. Review your total.", "address");
  }
  const cart = await getCart(session.customerId, client);
  const cartItem = cart.items[0];
  if (!cartItem || cartItem.sku !== quote.sku || cartItem.quantity !== quote.quantity) {
    throw errors.validation("Your cart changed. Review your total.", "quantity");
  }
  const compliance = await getCompliance();
  if (compliance.providerMode === "test" && !config.checkoutTestMode) throw errors.launchGateBlocked();
  const stock = await query(
    "SELECT id, stock FROM skus WHERE sku = $1 FOR UPDATE",
    [quote.sku],
    client
  );
  const sku = stock.rows[0];
  if (!sku || sku.stock < quote.quantity) throw errors.inventoryChanged();
  const reserved = await query(
    `UPDATE skus SET stock = stock - $2 WHERE id = $1 AND stock >= $2 RETURNING id`,
    [sku.id, quote.quantity],
    client
  );
  if (!reserved.rowCount) throw errors.inventoryChanged();
  const row = await query(
    `INSERT INTO orders (
       number, customer_id, quote_id, status, payment_status, fulfillment_status,
       currency, subtotal_minor, discount_minor, tax_minor, shipping_minor, total_minor,
       promotion_code, shipping_method, policy_version, message)
     VALUES ($1,$2,$3,'awaiting_payment','pending','unfulfilled',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      orderNumber(),
      session.customerId,
      quote.id,
      quote.currency,
      quote.subtotalMinor,
      quote.discountMinor,
      quote.taxMinor,
      quote.shippingMinor,
      quote.totalMinor,
      quote.promotionCode,
      quote.shippingMethod,
      compliance.policyVersion,
      config.providerMode === "test" ? "Test checkout \u2014 no live payment is taken." : null
    ],
    client
  );
  const order = row.rows[0];
  const lineTotal = quote.unitPriceMinor * quote.quantity;
  await query(
    `INSERT INTO order_items (order_id, sku, name, quantity, unit_price_minor, line_total_minor)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [order.id, quote.sku, `Sony wireless headphones`, quote.quantity, quote.unitPriceMinor, lineTotal],
    client
  );
  await query(
    `INSERT INTO order_addresses (order_id, line1, line2, city, postal_code, country_code)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [order.id, quote.address.line1, quote.address.line2, quote.address.city, quote.address.postalCode, quote.address.countryCode],
    client
  );
  await query(
    `INSERT INTO consents (customer_id, order_id, kind, version, granted)
     VALUES ($1,$2,'necessary',$3,true), ($1,$2,'marketing',$3,$4)`,
    [session.customerId, order.id, input.consentVersion, input.consentMarketing],
    client
  );
  if (quote.promotionCode) {
    const promotion = await query(
      "SELECT id FROM promotions WHERE upper(code) = upper($1)",
      [quote.promotionCode],
      client
    );
    if (promotion.rows[0]) {
      await query(
        "INSERT INTO promotion_redemptions (promotion_id, order_id, customer_id) VALUES ($1,$2,$3)",
        [promotion.rows[0].id, order.id, session.customerId],
        client
      );
    }
  }
  await query(
    `INSERT INTO inventory_reservations (sku_id, order_id, quantity, expires_at)
     VALUES ($1,$2,$3, now() + ($4 || ' minutes')::interval)`,
    [sku.id, order.id, quote.quantity, String(config.reservationTtlMinutes)],
    client
  );
  await markCartOrdered(quote.cartId, client);
  audit("order_created", {
    customerId: session.customerId,
    orderId: order.id,
    amountMinor: quote.totalMinor,
    correlationId: order.number
  });
  return mapOrder(order, client);
}
async function getOrder(orderId, session) {
  const result = await query(
    "SELECT * FROM orders WHERE id = $1 AND customer_id = $2",
    [orderId, session.customerId]
  );
  const row = result.rows[0];
  if (!row) throw errors.notFound("Order not found.");
  return mapOrder(row, pool);
}
async function markOrderPaid(orderId, client, paidAt) {
  await query(
    `UPDATE orders SET status = 'paid', payment_status = 'paid', paid_at = $2, updated_at = now()
      WHERE id = $1 AND status IN ('awaiting_payment','failed')`,
    [orderId, paidAt],
    client
  );
}
async function markOrderFailed(orderId, client, status) {
  await query(
    `UPDATE orders SET status = $2, payment_status = $2, updated_at = now()
      WHERE id = $1 AND status NOT IN ('paid','refunded')`,
    [orderId, status],
    client
  );
  if (status === "canceled" || status === "failed") {
    await query(
      `UPDATE skus SET stock = stock + r.quantity
         FROM inventory_reservations r
        WHERE r.order_id = $1 AND r.sku_id = skus.id AND r.released_at IS NULL`,
      [orderId],
      client
    );
    await query(
      "UPDATE inventory_reservations SET released_at = now() WHERE order_id = $1 AND released_at IS NULL",
      [orderId],
      client
    );
  }
}

// src/modules/payment/test-provider.ts
import { z } from "zod";
var webhookSchema = z.object({
  id: z.string().min(8),
  type: z.enum([
    "payment.succeeded",
    "payment.failed",
    "payment.canceled",
    "payment.requires_action",
    "payment.refunded",
    "payment.disputed"
  ]),
  data: z.object({
    sessionId: z.string().min(8),
    status: z.enum(["pending", "requires_action", "paid", "failed", "canceled", "refunded", "disputed"]),
    brand: z.string().nullable().default(null),
    last4: z.string().nullable().default(null),
    occurredAt: z.string()
  })
});
function nonceFor(sessionId) {
  return hmac(`nonce:${sessionId}:${config.paymentWebhookSecret}`);
}
function eventFromSession(row, eventId, status) {
  return {
    provider: "test",
    eventId,
    type: `payment.${status}`,
    sessionId: row.session_id,
    status,
    brand: row.brand,
    last4: row.last4,
    occurredAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
var testPaymentProvider = {
  name: "test",
  mode: "test",
  async createSession(_input, _client) {
    const providerSessionId = `tst_${randomToken(18)}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1e3);
    return {
      providerSessionId,
      checkoutUrl: `${config.publicApiOrigin}/api/payment/hosted-checkout?session=${encodeURIComponent(providerSessionId)}`,
      expiresAt
    };
  },
  async registerSession(providerSessionId, paymentId, expiresAt, client) {
    await query(
      `INSERT INTO test_payment_sessions (session_id, payment_id, nonce_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [providerSessionId, paymentId, hmac(nonceFor(providerSessionId)), expiresAt ?? new Date(Date.now() + 30 * 60 * 1e3)],
      client
    );
  },
  async verifyWebhook(input) {
    const header = input.headers["x-payment-signature"];
    if (!header) throw errors.validation("Missing payment signature.");
    const match = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(header);
    if (!match) throw errors.validation("Invalid payment signature format.");
    const timestamp = Number(match[1]);
    if (!Number.isFinite(timestamp)) throw errors.validation("Invalid payment signature timestamp.");
    if (Math.abs(Date.now() / 1e3 - timestamp) > config.webhookToleranceSeconds) {
      throw errors.validation("Payment signature is outside the allowed time window.");
    }
    const expected = hmac(`${timestamp}.${input.rawBody}:${config.paymentWebhookSecret}`);
    if (!safeEqual(expected, match[2])) throw errors.validation("Payment signature verification failed.");
    const parsed = webhookSchema.safeParse(JSON.parse(input.rawBody));
    if (!parsed.success) return null;
    return {
      provider: "test",
      eventId: parsed.data.id,
      type: parsed.data.type,
      sessionId: parsed.data.data.sessionId,
      status: parsed.data.data.status,
      brand: parsed.data.data.brand,
      last4: parsed.data.data.last4,
      occurredAt: parsed.data.data.occurredAt
    };
  },
  async verifySession(providerSessionId, client) {
    const result = await query(
      "SELECT session_id, payment_id, status, brand, last4 FROM test_payment_sessions WHERE session_id = $1",
      [providerSessionId],
      client
    );
    const row = result.rows[0];
    if (!row || row.status === "pending") return null;
    const status = row.status === "paid" ? "paid" : row.status === "failed" ? "failed" : "canceled";
    return eventFromSession(row, `reconcile_${providerSessionId}`, status);
  },
  async refund(_input, _client) {
    return { providerRefundId: `tre_${randomToken(12)}`, status: "succeeded" };
  },
  hostedFields(_input) {
    return {
      sessionId: "",
      provider: "test",
      mode: "test",
      status: "pending",
      card: { label: "Name on card / Card number", placeholder: "Handled by the hosted payment page" },
      expiry: { label: "Expiry", placeholder: "Hosted" },
      cvc: { label: "CVC", placeholder: "Hosted" },
      message: "Test mode: card details are never collected by this application.",
      actionLabel: "Continue to secure payment"
    };
  },
  async completeHosted(input, client) {
    const expected = nonceFor(input.sessionId);
    if (!safeEqual(expected, input.nonce)) throw errors.validation("Invalid hosted payment nonce.");
    const result = await query(
      `SELECT session_id, payment_id, status, brand, last4 FROM test_payment_sessions
        WHERE session_id = $1 AND expires_at > now() FOR UPDATE`,
      [input.sessionId],
      client
    );
    const row = result.rows[0];
    if (!row) throw errors.validation("That payment session has expired.", "session");
    if (row.status !== "pending") throw errors.validation("That payment session was already completed.", "session");
    const brand = input.outcome === "paid" ? "Test Card" : null;
    const last4 = input.outcome === "paid" ? "4242" : null;
    await query(
      "UPDATE test_payment_sessions SET status = $2, outcome = $3, brand = $4, last4 = $5, completed_at = now() WHERE session_id = $1",
      [input.sessionId, input.outcome, input.outcome, brand, last4],
      client
    );
    return eventFromSession({ ...row, brand, last4 }, `evt_${randomToken(16)}`, input.outcome);
  }
};
function hostedNonce(sessionId) {
  return nonceFor(sessionId);
}

// src/modules/payment/service.ts
var paymentProvider = testPaymentProvider;
var statusRank = {
  pending: 0,
  requires_action: 1,
  failed: 2,
  canceled: 2,
  paid: 3,
  disputed: 4,
  refunded: 4
};
function mapPayment(row) {
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
    returnUrl: row.return_url
  };
}
async function loadPaymentForOrder(orderId, session, client) {
  const result = await query(
    `SELECT p.*, o.number FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE p.order_id = $1 AND o.customer_id = $2
      ORDER BY p.created_at DESC LIMIT 1`,
    [orderId, session.customerId],
    client
  );
  const row = result.rows[0];
  if (!row) throw errors.notFound("Order not found.");
  return row;
}
async function createPayment(input, session, client) {
  const order = await query(
    `SELECT id, status, total_minor, currency, number FROM orders
      WHERE id = $1 AND customer_id = $2`,
    [input.orderId, session.customerId],
    client
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
    returnUrl
  }, client);
  const inserted = await query(
    `INSERT INTO payments (
       order_id, provider, provider_session_id, method, status, amount_minor, currency,
       checkout_url, expires_at, return_url)
     VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      orderRow.id,
      paymentProvider.name,
      providerSession.providerSessionId,
      input.method,
      orderRow.total_minor,
      orderRow.currency,
      providerSession.checkoutUrl,
      providerSession.expiresAt,
      returnUrl
    ],
    client
  );
  const payment = inserted.rows[0];
  await paymentProvider.registerSession(
    providerSession.providerSessionId,
    payment.id,
    providerSession.expiresAt,
    client
  );
  await query(
    "INSERT INTO payment_events (payment_id, event_type, status, payload) VALUES ($1,'session.created','pending',$2::jsonb)",
    [payment.id, JSON.stringify({ provider: paymentProvider.name, method: input.method })],
    client
  );
  audit("payment_session_created", {
    customerId: session.customerId,
    orderId: orderRow.id,
    paymentId: payment.id,
    correlationId: orderRow.number
  });
  return mapPayment({ ...payment, number: orderRow.number });
}
async function getPayment(paymentId, session) {
  const result = await query(
    `SELECT p.*, o.number FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE p.id = $1 AND o.customer_id = $2`,
    [paymentId, session.customerId]
  );
  const row = result.rows[0];
  if (!row) throw errors.notFound("Payment not found.");
  return mapPayment(row);
}
async function getPaymentBySession(providerSessionId, session) {
  const result = await query(
    `SELECT p.*, o.number FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE p.provider_session_id = $1 AND o.customer_id = $2`,
    [providerSessionId, session.customerId]
  );
  const row = result.rows[0];
  if (!row) throw errors.notFound("Payment not found.");
  return mapPayment(row);
}
async function applyVerifiedEvent(event) {
  return withTransaction(async (client) => {
    const inserted = await query(
      `INSERT INTO webhook_events (provider, event_id, event_type, payload_hash)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (provider, event_id) DO NOTHING
       RETURNING id`,
      [event.provider, event.eventId, event.type, event.occurredAt],
      client
    );
    if (!inserted.rowCount) return { duplicate: true, ignored: true };
    const payment = await query(
      `SELECT p.id, p.order_id, p.status, o.number, o.customer_id
         FROM payments p JOIN orders o ON o.id = p.order_id
        WHERE p.provider_session_id = $1 FOR UPDATE OF p`,
      [event.sessionId],
      client
    );
    const current = payment.rows[0];
    if (!current) {
      await query("UPDATE webhook_events SET status = 'ignored', processed_at = now() WHERE id = $1", [inserted.rows[0].id], client);
      return { duplicate: false, ignored: true };
    }
    await query(
      `INSERT INTO payment_events (payment_id, event_type, status, payload)
       VALUES ($1,$2,$3,$4::jsonb)`,
      [current.id, event.type, event.status, JSON.stringify(event)],
      client
    );
    if (statusRank[event.status] < statusRank[current.status]) {
      await query("UPDATE webhook_events SET status = 'ignored', processed_at = now() WHERE id = $1", [inserted.rows[0].id], client);
      return { duplicate: false, ignored: true };
    }
    await query(
      `UPDATE payments SET status = $2, brand = COALESCE($3, brand), last4 = COALESCE($4, last4),
         updated_at = now() WHERE id = $1`,
      [current.id, event.status, event.brand, event.last4],
      client
    );
    if (event.status === "paid") {
      await markOrderPaid(current.order_id, client, new Date(event.occurredAt));
      await query(
        `INSERT INTO outbox_emails (recipient, subject, body, purpose)
         SELECT c.email, $2, $3, 'receipt'
           FROM customers c WHERE c.id = $1 AND c.email IS NOT NULL`,
        [current.customer_id, "Your receipt", `Receipt for order ${current.number}`],
        client
      );
    } else if (["failed", "canceled", "disputed", "refunded"].includes(event.status)) {
      const orderStatus = event.status === "disputed" || event.status === "refunded" ? event.status : event.status;
      await markOrderFailed(current.order_id, client, orderStatus);
    }
    await query("UPDATE webhook_events SET status = 'processed', processed_at = now() WHERE id = $1", [inserted.rows[0].id], client);
    audit("payment_event_applied", {
      orderId: current.order_id,
      paymentId: current.id,
      correlationId: current.number,
      status: event.status,
      eventId: event.eventId
    });
    return { duplicate: false, ignored: false };
  });
}
async function handleWebhook(rawBody, headers) {
  const event = await paymentProvider.verifyWebhook({ rawBody, headers });
  if (!event) return { duplicate: false, ignored: true };
  return applyVerifiedEvent(event);
}
async function createRefund(orderId, input, session) {
  return withTransaction(async (client) => {
    const payment = await loadPaymentForOrder(orderId, session, client);
    const order = await query(
      "SELECT status, total_minor, currency, number FROM orders WHERE id = $1 FOR UPDATE",
      [orderId],
      client
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
      reason: input.reason
    }, client);
    const inserted = await query(
      `INSERT INTO refunds (payment_id, order_id, provider_refund_id, amount_minor, currency, reason, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [payment.id, orderId, result.providerRefundId, amount, payment.currency, input.reason, result.status],
      client
    );
    await query("UPDATE payments SET status = 'refunded', updated_at = now() WHERE id = $1", [payment.id], client);
    await query("UPDATE orders SET status = 'refunded', payment_status = 'refunded', updated_at = now() WHERE id = $1", [orderId], client);
    await query(
      `INSERT INTO outbox_emails (recipient, subject, body, purpose)
       SELECT email, $2, $3, 'refund'
         FROM customers WHERE id = $1 AND email IS NOT NULL`,
      [session.customerId, "Refund confirmation", `Refund for order ${orderRow.number}`],
      client
    );
    audit("refund_created", {
      customerId: session.customerId,
      orderId,
      paymentId: payment.id,
      correlationId: orderRow.number,
      amountMinor: amount
    });
    return { id: inserted.rows[0].id, status: result.status };
  });
}

// src/modules/orders/routes.ts
var ordersRouter = Router7();
ordersRouter.post("/orders", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  const input = parseBody(createOrderRequestSchema, req.body);
  const key = readIdempotencyKey(req);
  const result = await runIdempotent({
    customerId: session.customerId,
    scope: "order.create",
    key,
    request: input,
    work: (client) => createOrder(input, session, client)
  });
  res.locals.orderId = result.value.id;
  res.status(result.replayed ? 200 : 201).json(result.value);
}));
ordersRouter.get("/orders/:id", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  const order = await getOrder(String(req.params.id), session);
  res.locals.orderId = order.id;
  res.json({ order });
}));
ordersRouter.post("/orders/:id/refund", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  const input = parseBody(
    refundRequestSchema.omit({ orderId: true }),
    req.body
  );
  const key = readIdempotencyKey(req);
  const result = await runIdempotent({
    customerId: session.customerId,
    scope: "order.refund",
    key,
    request: { orderId: String(req.params.id), ...input },
    work: () => createRefund(String(req.params.id), input, session)
  });
  res.locals.orderId = String(req.params.id);
  res.json(result.value);
}));

// src/modules/payment/routes.ts
import { Router as Router8 } from "express";
import {
  createPaymentRequestSchema
} from "@checkout/shared";
var paymentRouter = Router8();
paymentRouter.post("/payment/sessions", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  const input = parseBody(createPaymentRequestSchema, req.body);
  const key = readIdempotencyKey(req);
  const result = await runIdempotent({
    customerId: session.customerId,
    scope: "payment.create",
    key,
    request: input,
    work: (client) => createPayment(input, session, client)
  });
  res.status(result.replayed ? 200 : 201).json(result.value);
}));
paymentRouter.get("/payment/id/:id", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  res.json({ payment: await getPayment(String(req.params.id), session) });
}));
paymentRouter.get("/payment/session/:sessionId", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  res.json({ payment: await getPaymentBySession(String(req.params.sessionId), session) });
}));
paymentRouter.post("/payment/webhook", asyncRoute(async (req, res) => {
  const rawBody = req.rawBody;
  if (typeof rawBody !== "string") throw errors.validation("Raw webhook body is required.");
  const result = await handleWebhook(rawBody, req.headers);
  res.json({ received: true, ...result });
}));
paymentRouter.post("/payment/test/complete", asyncRoute(async (req, res) => {
  if (config.providerMode !== "test") throw errors.forbidden();
  const sessionId = String(req.body?.session ?? "");
  const nonce = String(req.body?.nonce ?? "");
  const outcome = String(req.body?.outcome ?? "");
  if (!["paid", "failed", "canceled"].includes(outcome)) throw errors.validation("Invalid outcome.");
  const result = await withTransaction(async (client) => {
    const event = await paymentProvider.completeHosted({ sessionId, nonce, outcome }, client);
    const applied = await applyVerifiedEvent(event);
    const payment = await query(
      "SELECT return_url FROM payments WHERE provider_session_id = $1",
      [sessionId],
      client
    );
    return { applied, returnUrl: payment.rows[0]?.return_url ?? config.publicWebOrigin };
  });
  const separator = result.returnUrl.includes("?") ? "&" : "?";
  res.redirect(303, `${result.returnUrl}${separator}payment=${encodeURIComponent(sessionId)}&result=${outcome}`);
}));
paymentRouter.get("/payment/hosted-checkout", asyncRoute(async (req, res) => {
  if (config.providerMode !== "test") throw errors.forbidden();
  const sessionId = String(req.query.session ?? "");
  const payment = await query(
    `SELECT p.id, p.method, p.status, p.amount_minor, p.currency, o.number
       FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE p.provider_session_id = $1`,
    [sessionId]
  );
  const row = payment.rows[0];
  if (!row) throw errors.notFound("Payment session not found.");
  const escape = (value) => value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char] ?? char);
  const amount = (row.amount_minor / 100).toFixed(2);
  const methodLabel = row.method === "card" ? "Credit card (test)" : "PayPal (test)";
  const disabledInputs = row.method === "card" ? `<label>Name on card<input disabled placeholder="Handled by secure provider"></label>
       <label>Card number<input disabled placeholder="Hosted fields \u2014 no PAN collected"></label>
       <div class="row"><label>Expiry<input disabled placeholder="MM/YY"></label><label>CVC<input disabled placeholder="Hosted"></label></div>` : `<p class="notice">You will be redirected to the provider's hosted PayPal confirmation.</p>`;
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Secure payment \u2014 test provider</title>
<style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#1e293b;margin:0;padding:2rem}
main{max-width:34rem;margin:auto;background:white;padding:2rem;border-radius:1rem;box-shadow:0 1px 4px #cbd5e1}
label{display:block;margin:1rem 0;font-weight:600}input{display:block;width:100%;padding:.8rem;margin-top:.35rem;border:1px solid #cbd5e1;border-radius:.5rem;background:#f1f5f9}
.row{display:flex;gap:1rem}.row label{flex:1}button{padding:.8rem 1.4rem;border:0;border-radius:.6rem;font-weight:700;cursor:pointer}
.pay{background:#0284c7;color:white}.secondary{background:#e2e8f0;color:#334155}.notice{background:#fef3c7;padding:1rem;border-radius:.5rem}</style></head>
<body><main><h1>Secure payment</h1><p>Order ${escape(row.number)} \u2014 ${escape(row.currency)} ${amount}</p>
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

// src/modules/compliance/routes.ts
import { Router as Router9 } from "express";
import { privacyRequestSchema } from "@checkout/shared";
var complianceRouter = Router9();
complianceRouter.get("/compliance/config", asyncRoute(async (_req, res) => {
  res.json({ compliance: await getCompliance() });
}));
complianceRouter.get("/policies/:key", asyncRoute(async (req, res) => {
  const policy = await getPolicyDocument(String(req.params.key));
  const escape = (value) => value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char] ?? char);
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(policy.title)} \u2014 Dummy Account</title>
<style>body{font-family:system-ui,sans-serif;max-width:44rem;margin:3rem auto;padding:0 1rem;line-height:1.6;color:#1e293b}
.notice{background:#fef3c7;border-left:4px solid #f59e0b;padding:1rem;border-radius:.25rem}</style></head>
<body><h1>${escape(policy.title)}</h1>
${policy.reviewed ? "" : '<p class="notice">DRAFT \u2014 this text has not passed legal review and must not be relied on as a final policy.</p>'}
<p>${escape(policy.text)}</p><p><small>Version: ${escape(policy.version)}</small></p>
<p><a href="/">Return to checkout</a></p></body></html>`);
}));
complianceRouter.post("/privacy/requests", asyncRoute(async (req, res) => {
  const input = parseBody(privacyRequestSchema, req.body);
  const session = await loadSession(req);
  const result = await createPrivacyRequest(input, session?.customerId ?? null);
  res.status(201).json(result);
}));
complianceRouter.get("/privacy/export", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  res.json(await exportCustomerData(session.customerId));
}));
complianceRouter.post("/privacy/anonymize", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  await anonymizeCustomer(session.customerId);
  res.json({ ok: true, message: "Your data has been anonymized. Transaction records are retained where required." });
}));

// src/app.ts
var here = dirname(fileURLToPath2(import.meta.url));
var webDist = join(here, "..", "..", "checkout-page", "dist");
function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(requestContext);
  app.use(express.json({
    limit: "64kb",
    verify: (req, _res, buffer) => {
      req.rawBody = buffer.toString("utf8");
    }
  }));
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));
  app.use(cookieParser());
  app.use(csrfProtection);
  app.get("/api/health", async (_req, res) => {
    try {
      await query("SELECT 1");
      const compliance = await getCompliance();
      res.json({
        ok: true,
        database: "connected",
        providerMode: compliance.providerMode,
        liveCheckoutEnabled: compliance.liveCheckoutEnabled,
        ...metricsSnapshot()
      });
    } catch {
      res.status(503).json({ ok: false, database: "unavailable" });
    }
  });
  app.get("/api/health/metrics", (_req, res) => res.json(metricsSnapshot()));
  app.use("/api", bootstrapRouter);
  app.use("/api/identity", identityRouter);
  app.use("/api/catalog", catalogRouter);
  app.use("/api", cartRouter);
  app.use("/api", shippingRouter);
  app.use("/api", pricingRouter);
  app.use("/api", ordersRouter);
  app.use("/api", paymentRouter);
  app.use("/api", complianceRouter);
  if (existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(webDist, "index.html")));
  }
  app.use((_req, res) => res.status(404).json({
    code: "NOT_FOUND",
    message: "Endpoint not found.",
    retryable: false,
    requestId: res.locals.requestId
  }));
  app.use(errorHandler);
  return app;
}

// src/migrations/0001_init.ts
var up = String.raw`
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

// src/migrations/index.ts
var migrations = [{ name: "0001_init", up }];

// src/migrations/run.ts
async function runMigrations() {
  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(918273645)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    for (const migration of migrations) {
      const existing = await client.query(
        "SELECT 1 FROM schema_migrations WHERE name = $1",
        [migration.name]
      );
      if (existing.rowCount) continue;
      await client.query(migration.up);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migration.name]);
    }
  });
}

// src/server.ts
async function main() {
  await runMigrations();
  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info({
      port: config.port,
      providerMode: config.providerMode,
      webOrigin: config.publicWebOrigin
    }, "checkout API listening");
  });
  const shutdown = (signal) => {
    logger.info({ signal }, "shutting down");
    server.close(() => {
      void closeDatabase().then(() => process.exit(0));
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
main().catch((error) => {
  logger.error({ err: error instanceof Error ? error.message : String(error) }, "startup failed");
  process.exit(1);
});
//# sourceMappingURL=server.js.map