import type { Request, Response } from "express";
import { pool, query, type Queryable } from "../db.js";
import { config } from "../config.js";
import { errors } from "../errors.js";
import { hashForIndex, tokenHash } from "./security.js";

export const SESSION_COOKIE = "checkout_session";
export const CSRF_COOKIE = "checkout_csrf";

export interface SessionContext {
  sessionId: string;
  customerId: string;
  csrfToken: string;
  name: string;
  email: string | null;
  isGuest: boolean;
}

interface SessionRow {
  id: string;
  customer_id: string;
  csrf_token: string;
  name: string;
  email: string | null;
  is_guest: boolean;
}

export async function loadSession(
  req: Request,
  client: Queryable = pool,
): Promise<SessionContext | null> {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!token) return null;
  const rows = await query<SessionRow>(
    `SELECT s.id, s.customer_id, s.csrf_token, c.name, c.email, c.is_guest
       FROM sessions s JOIN customers c ON c.id = s.customer_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [tokenHash(token)],
    client,
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
    isGuest: row.is_guest,
  };
}

export function setSessionCookies(res: Response, token: string, csrfToken: string): void {
  const base = {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax" as const,
    path: "/",
    domain: config.cookieDomain,
    maxAge: config.sessionTtlHours * 60 * 60 * 1000,
  };
  res.cookie(SESSION_COOKIE, token, base);
  res.cookie(CSRF_COOKIE, csrfToken, { ...base, httpOnly: false });
}

export function clearSessionCookies(res: Response): void {
  const base = {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax" as const,
    path: "/",
    domain: config.cookieDomain,
  };
  res.clearCookie(SESSION_COOKIE, base);
  res.clearCookie(CSRF_COOKIE, { ...base, httpOnly: false });
}

export function requireSession(session: SessionContext | null): SessionContext {
  if (!session) throw errors.unauthorized();
  return session;
}

export function requireOwnership(session: SessionContext, customerId: string): void {
  if (session.customerId !== customerId) throw errors.forbidden();
}

export function emailIndex(email: string): string {
  return hashForIndex(email);
}
