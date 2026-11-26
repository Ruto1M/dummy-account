import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodTypeAny } from "zod";
import { AppError, errors } from "../errors.js";
import { logger } from "../logger.js";
import { metrics } from "../metrics.js";
import { randomToken, safeEqual, verifyCsrf } from "./security.js";

export type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncRoute(handler: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void handler(req, res, next).catch(next);
  };
}

export function parseBody<T>(schema: ZodTypeAny, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const field = first?.path.map(String).join(".");
    throw errors.validation(first?.message ?? "Invalid request.", field);
  }
  return result.data as T;
}

export function requestId(res: Response): string {
  return String(res.locals.requestId ?? "unknown");
}

export function correlationFields(res: Response) {
  return {
    requestId: requestId(res),
    correlationId: String(res.locals.correlationId ?? requestId(res)),
    orderId: res.locals.orderId as string | undefined,
    paymentId: res.locals.paymentId as string | undefined,
  };
}

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("x-request-id");
  const id = incoming && /^[a-zA-Z0-9_-]{8,64}$/.test(incoming) ? incoming : randomToken(12);
  res.locals.requestId = id;
  res.locals.correlationId = req.header("x-correlation-id") ?? id;
  res.setHeader("X-Request-Id", id);
  metrics.requests += 1;
  next();
}

export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  // Provider callbacks and the test provider's hosted page are authenticated by
  // provider signatures/nonces, not by the browser session's CSRF token.
  if (req.path.includes("/payment/webhook") || req.path.includes("/payment/test/")) {
    next();
    return;
  }
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  const cookie = req.cookies?.checkout_csrf as string | undefined;
  const header = req.header("x-csrf-token");
  if (!cookie || !header || !verifyCsrf(cookie) || !safeEqual(cookie, header)) {
    next(new AppError({
      code: "CSRF_FAILED",
      message: "Your session expired. Reload the page and try again.",
      status: 403,
      retryable: true,
    }));
    return;
  }
  next();
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;

  let status = 500;
  let payload = {
    code: "INTERNAL",
    message: "Something went wrong. Please try again.",
    retryable: true,
    requestId: requestId(res),
  };

  if (err instanceof AppError) {
    status = err.status;
    payload = {
      code: err.code,
      message: err.message,
      retryable: err.retryable,
      requestId: requestId(res),
    };
    if (err.field) Object.assign(payload, { field: err.field });
  } else if (err instanceof ZodError) {
    const first = err.issues[0];
    status = 422;
    payload = {
      code: "VALIDATION_ERROR",
      message: first?.message ?? "Invalid request.",
      retryable: false,
      requestId: requestId(res),
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
    ...(status >= 500 && process.env.NODE_ENV !== "production" && err instanceof Error ? { stack: err.stack } : {}),
    method: req.method,
    path: req.path,
    status,
  }, "request failed");

  res.status(status).json(payload);
}
