import type { ErrorCode } from "@checkout/shared";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly field?: string;
  readonly retryable: boolean;

  constructor(options: {
    code: ErrorCode;
    message: string;
    status?: number;
    field?: string;
    retryable?: boolean;
  }) {
    super(options.message);
    this.name = "AppError";
    this.code = options.code;
    this.status = options.status ?? 400;
    this.field = options.field;
    this.retryable = options.retryable ?? false;
  }
}

export const errors = {
  validation: (message: string, field?: string) =>
    new AppError({ code: "VALIDATION_ERROR", message, status: 422, field }),
  unauthorized: (message = "Please sign in to continue.") =>
    new AppError({ code: "UNAUTHORIZED", message, status: 401 }),
  forbidden: (message = "You do not have access to this resource.") =>
    new AppError({ code: "FORBIDDEN", message, status: 403 }),
  notFound: (message = "The requested resource was not found.") =>
    new AppError({ code: "NOT_FOUND", message, status: 404 }),
  conflict: (message: string) =>
    new AppError({ code: "CONFLICT", message, status: 409 }),
  rateLimited: (message = "Too many attempts. Please try again shortly.") =>
    new AppError({ code: "RATE_LIMITED", message, status: 429, retryable: true }),
  quoteExpired: () =>
    new AppError({
      code: "QUOTE_EXPIRED",
      message: "Your price has expired. Review the latest total and try again.",
      status: 409,
      retryable: true,
    }),
  inventoryChanged: () =>
    new AppError({
      code: "INVENTORY_CHANGED",
      message: "Availability changed while you were checking out. Review your cart and try again.",
      status: 409,
      retryable: true,
    }),
  idempotencyConflict: () =>
    new AppError({
      code: "IDEMPOTENCY_CONFLICT",
      message: "That request key was already used with different details.",
      status: 409,
    }),
  launchGateBlocked: (message = "Checkout is not open yet. Required launch checks are incomplete.") =>
    new AppError({ code: "LAUNCH_GATE_BLOCKED", message, status: 423 }),
  paymentPending: () =>
    new AppError({
      code: "PAYMENT_PENDING",
      message: "Your payment is still being confirmed. This page will update automatically.",
      status: 409,
      retryable: true,
    }),
  paymentDeclined: () =>
    new AppError({
      code: "PAYMENT_DECLINED",
      message: "The payment was not approved. Choose another method or try again.",
      status: 402,
    }),
  paymentCancelled: () =>
    new AppError({
      code: "PAYMENT_CANCELLED",
      message: "Payment was cancelled. Your order was not charged.",
      status: 409,
      retryable: true,
    }),
  upstream: (message = "A dependent service is unavailable. Please retry.") =>
    new AppError({ code: "UPSTREAM_UNAVAILABLE", message, status: 503, retryable: true }),
  internal: () =>
    new AppError({ code: "INTERNAL", message: "Something went wrong. Please try again.", status: 500, retryable: true }),
};
