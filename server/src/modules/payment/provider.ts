import type { HostedFields, PaymentMethod, PaymentStatus } from "@checkout/shared";
import type { Queryable } from "../../db.js";

export interface CreateProviderSessionInput {
  paymentId: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  method: PaymentMethod;
  returnUrl: string;
}

export interface ProviderSession {
  providerSessionId: string;
  checkoutUrl: string;
  expiresAt: Date | null;
}

export interface ProviderEvent {
  provider: string;
  eventId: string;
  type: string;
  sessionId: string;
  status: PaymentStatus;
  brand: string | null;
  last4: string | null;
  occurredAt: string;
}

export interface VerifyWebhookInput {
  rawBody: string;
  headers: Record<string, string | undefined>;
}

export interface RefundInput {
  paymentId: string;
  providerSessionId: string;
  amountMinor: number;
  currency: string;
  reason: string;
}

export interface RefundResult {
  providerRefundId: string;
  status: "pending" | "succeeded";
}

/**
 * Vendor-neutral boundary. Only the test adapter is registered in this repository.
 * A real adapter must implement hosted fields/redirect, server-side session verification,
 * signature verification and refunds without exposing card data to the application.
 */
export interface PaymentProvider {
  readonly name: string;
  readonly mode: "test" | "sandbox" | "live";
  createSession(input: CreateProviderSessionInput, client: Queryable): Promise<ProviderSession>;
  registerSession(providerSessionId: string, paymentId: string, expiresAt: Date | null, client: Queryable): Promise<void>;
  verifyWebhook(input: VerifyWebhookInput): Promise<ProviderEvent | null>;
  verifySession(providerSessionId: string, client: Queryable): Promise<ProviderEvent | null>;
  refund(input: RefundInput, client: Queryable): Promise<RefundResult>;
  hostedFields(input: { method: PaymentMethod; checkoutUrl: string }): HostedFields;
  completeHosted(input: { sessionId: string; nonce: string; outcome: "paid" | "failed" | "canceled" }, client: Queryable): Promise<ProviderEvent>;
}
