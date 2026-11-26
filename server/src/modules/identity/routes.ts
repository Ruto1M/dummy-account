import { Router } from "express";
import {
  loginRequestSchema,
  recoveryRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  type LoginRequest,
  type RecoveryRequest,
  type RegisterRequest,
  type ResetPasswordRequest,
  type SessionUser,
} from "@checkout/shared";
import { asyncRoute, parseBody } from "../../lib/http.js";
import { loadSession, requireSession } from "../../lib/session.js";
import { hmac } from "../../lib/security.js";
import {
  createGuest,
  login,
  logout,
  register,
  requestRecovery,
  resetPassword,
} from "./service.js";

export const identityRouter = Router();

identityRouter.get("/session", asyncRoute(async (req, res) => {
  const session = await loadSession(req);
  const user: SessionUser | null = session ? {
    id: session.customerId,
    name: session.name,
    email: session.email,
    isGuest: session.isGuest,
    csrfToken: session.csrfToken,
  } : null;
  res.json({ user });
}));

identityRouter.post("/guest", asyncRoute(async (_req, res) => {
  const user = await createGuest(res);
  res.status(201).json({ user });
}));

identityRouter.post("/register", asyncRoute(async (req, res) => {
  const input = parseBody<RegisterRequest>(registerRequestSchema, req.body);
  const user = await register(input, await loadSession(req), res);
  res.status(201).json({ user });
}));

identityRouter.post("/login", asyncRoute(async (req, res) => {
  const input = parseBody<LoginRequest>(loginRequestSchema, req.body);
  const ipHash = hmac(req.ip ?? "unknown");
  const user = await login(input, await loadSession(req), ipHash, res);
  res.json({ user });
}));

identityRouter.post("/logout", asyncRoute(async (req, res) => {
  await logout(requireSession(await loadSession(req)), res);
  res.json({ ok: true });
}));

identityRouter.post("/recovery", asyncRoute(async (req, res) => {
  const input = parseBody<RecoveryRequest>(recoveryRequestSchema, req.body);
  await requestRecovery(input);
  res.json({ ok: true, message: "If an account exists, a reset link has been queued." });
}));

identityRouter.post("/reset-password", asyncRoute(async (req, res) => {
  const input = parseBody<ResetPasswordRequest>(resetPasswordRequestSchema, req.body);
  await resetPassword(input);
  res.json({ ok: true });
}));
