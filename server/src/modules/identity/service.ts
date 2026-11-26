import type { LoginRequest, RecoveryRequest, RegisterRequest, ResetPasswordRequest, SessionUser } from "@checkout/shared";
import type { Response } from "express";
import { config } from "../../config.js";
import { pool, query, withTransaction, type Queryable } from "../../db.js";
import { AppError, errors } from "../../errors.js";
import { audit } from "../../logger.js";
import {
  emailIndex,
  type SessionContext,
  setSessionCookies,
  clearSessionCookies,
} from "../../lib/session.js";
import {
  hashPassword,
  randomToken,
  signCsrf,
  tokenHash,
  verifyPassword,
} from "../../lib/security.js";
import { addDefaultItem, getCart, mergeGuestCart } from "../cart/service.js";

interface CustomerRow { id: string; name: string; email: string | null; is_guest: boolean }

// A guest cart may already be marked ordered/abandoned. In that case there is
// nothing to merge, so seed a fresh cart instead of leaving a dead-end checkout.
async function carryOverGuestCart(guestCustomerId: string, targetCustomerId: string, client: Queryable): Promise<void> {
  await mergeGuestCart(guestCustomerId, targetCustomerId, client);
  const cart = await getCart(targetCustomerId, client);
  if (!cart.items.length) await addDefaultItem(targetCustomerId, client);
}

function publicUser(session: SessionContext): SessionUser {
  return {
    id: session.customerId,
    name: session.name,
    email: session.email,
    isGuest: session.isGuest,
    csrfToken: session.csrfToken,
  };
}

async function issueSession(customerId: string, res: Response, client: Queryable = pool): Promise<SessionContext> {
  const token = randomToken(32);
  const csrfNonce = randomToken(24);
  const csrfToken = signCsrf(csrfNonce);
  const inserted = await query<{ id: string }>(
    `INSERT INTO sessions (customer_id, token_hash, csrf_token, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' hours')::interval)
     RETURNING id`,
    [customerId, tokenHash(token), csrfToken, String(config.sessionTtlHours)],
    client,
  );
  const customer = await query<CustomerRow>("SELECT id, name, email, is_guest FROM customers WHERE id = $1", [customerId], client);
  const row = customer.rows[0];
  if (!row) throw errors.internal();
  const session: SessionContext = {
    sessionId: inserted.rows[0]!.id,
    customerId: row.id,
    csrfToken,
    name: row.name,
    email: row.email,
    isGuest: row.is_guest,
  };
  setSessionCookies(res, token, csrfToken);
  return session;
}

async function revokeSession(session: SessionContext | null, client: Queryable = pool): Promise<void> {
  if (!session) return;
  await query("UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL", [session.sessionId], client);
}

export async function ensureCsrf(req: { cookies?: Record<string, string> }, res: Response): Promise<string> {
  const existing = req.cookies?.checkout_csrf;
  if (existing) return existing;
  const token = signCsrf(randomToken(24));
  res.cookie("checkout_csrf", token, {
    httpOnly: false,
    secure: config.cookieSecure,
    sameSite: "lax",
    path: "/",
    domain: config.cookieDomain,
    maxAge: config.sessionTtlHours * 60 * 60 * 1000,
  });
  return token;
}

export async function createGuest(res: Response): Promise<SessionUser> {
  const session = await withTransaction(async (client) => {
    const customer = await query<{ id: string }>(
      `INSERT INTO customers (email, name, is_guest) VALUES (NULL, 'Guest', true) RETURNING id`,
      [], client,
    );
    const customerId = customer.rows[0]!.id;
    const created = await issueSession(customerId, res, client);
    await addDefaultItem(customerId, client);
    return created;
  });
  audit("guest_created", { customerId: session.customerId });
  return publicUser(session);
}

export async function register(
  input: RegisterRequest,
  existing: SessionContext | null,
  res: Response,
): Promise<SessionUser> {
  const email = input.email.toLowerCase();
  const session = await withTransaction(async (client) => {
    const duplicate = await query("SELECT 1 FROM customers WHERE lower(email) = $1", [email], client);
    if (duplicate.rowCount) {
      throw new AppError({
        code: "CONFLICT",
        message: "An account with that email may already exist. Sign in instead.",
        status: 409,
      });
    }
    const passwordHash = await hashPassword(input.password);
    const customer = await query<{ id: string; name: string }>(
      `INSERT INTO customers (email, name, is_guest)
       VALUES ($1, split_part($1, '@', 1), false) RETURNING id, name`,
      [email], client,
    );
    const customerId = customer.rows[0]!.id;
    await query(
      `INSERT INTO identities (customer_id, password_hash, password_params)
       VALUES ($1, $2, $3::jsonb)`,
      [customerId, passwordHash, JSON.stringify({ algorithm: "scrypt", N: 16384, r: 8, p: 1 })],
      client,
    );
    if (existing?.isGuest) await carryOverGuestCart(existing.customerId, customerId, client);
    else await addDefaultItem(customerId, client);
    await revokeSession(existing, client);
    return issueSession(customerId, res, client);
  });
  audit("registered", { customerId: session.customerId });
  return publicUser(session);
}

export async function login(
  input: LoginRequest,
  existing: SessionContext | null,
  ipHash: string,
  res: Response,
): Promise<SessionUser> {
  const email = input.email.toLowerCase();
  const generic = () => errors.unauthorized("Invalid email or password.");

  const attempts = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM login_attempts
      WHERE email_hash = $1 AND created_at > now() - interval '15 minutes'`,
    [emailIndex(email)],
  );
  if (Number(attempts.rows[0]?.count ?? 0) >= 10) throw errors.rateLimited();

  const row = await query<{ customer_id: string; password_hash: string; failed_attempts: number; locked_until: Date | null }>(
    `SELECT i.customer_id, i.password_hash, i.failed_attempts, i.locked_until
       FROM identities i JOIN customers c ON c.id = i.customer_id
      WHERE lower(c.email) = $1`,
    [email],
  );
  const identity = row.rows[0];

  if (!identity || (identity.locked_until && identity.locked_until > new Date())) {
    await query(
      "INSERT INTO login_attempts (email_hash, ip_hash, succeeded) VALUES ($1, $2, false)",
      [emailIndex(email), ipHash],
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
        [identity.customer_id, failures], client,
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

export async function logout(session: SessionContext | null, res: Response): Promise<void> {
  await revokeSession(session);
  clearSessionCookies(res);
  audit("logout", { customerId: session?.customerId });
}

export async function requestRecovery(input: RecoveryRequest): Promise<void> {
  const email = input.email.toLowerCase();
  const customer = await query<{ id: string }>("SELECT id FROM customers WHERE lower(email) = $1", [email]);
  if (customer.rows[0]) {
    const token = randomToken(32);
    await withTransaction(async (client) => {
      await query(
        `INSERT INTO recovery_tokens (customer_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '1 hour')`,
        [customer.rows[0]!.id, tokenHash(token)], client,
      );
      await query(
        `INSERT INTO outbox_emails (recipient, subject, body, purpose)
         VALUES ($1, 'Reset your password',
                 $2, 'recovery')`,
        [email, `${config.publicWebOrigin}/reset-password?token=${token}`], client,
      );
    });
  }
  // Identical response for known and unknown addresses.
}

export async function resetPassword(input: ResetPasswordRequest): Promise<void> {
  const hash = tokenHash(input.token);
  const token = await query<{ id: string; customer_id: string }>(
    `SELECT id, customer_id FROM recovery_tokens
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [hash],
  );
  if (!token.rows[0]) throw errors.validation("That reset link is invalid or has expired.", "token");
  const passwordHash = await hashPassword(input.password);
  await withTransaction(async (client) => {
    await query("UPDATE recovery_tokens SET used_at = now() WHERE id = $1", [token.rows[0]!.id], client);
    await query(
      `INSERT INTO identities (customer_id, password_hash, password_params)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (customer_id) DO UPDATE SET password_hash = EXCLUDED.password_hash,
         password_params = EXCLUDED.password_params, failed_attempts = 0, locked_until = NULL`,
      [token.rows[0]!.customer_id, passwordHash, JSON.stringify({ algorithm: "scrypt", N: 16384, r: 8, p: 1 })],
      client,
    );
    await query("UPDATE sessions SET revoked_at = now() WHERE customer_id = $1", [token.rows[0]!.customer_id], client);
  });
  audit("password_reset", { customerId: token.rows[0]!.customer_id });
}

