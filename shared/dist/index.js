/**
 * Shared, validated contracts for the browser and the server.
 * All money values are INTEGER MINOR UNITS (e.g. pence), never floats.
 */
import { z } from "zod";
export const ERROR_CODES = [
    "VALIDATION_ERROR",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "RATE_LIMITED",
    "QUOTE_EXPIRED",
    "PAYMENT_PENDING",
    "PAYMENT_DECLINED",
    "PAYMENT_CANCELLED",
    "INVENTORY_CHANGED",
    "IDEMPOTENCY_CONFLICT",
    "LAUNCH_GATE_BLOCKED",
    "UPSTREAM_UNAVAILABLE",
    "CSRF_FAILED",
    "INTERNAL",
];
export const errorCodeSchema = z.enum(ERROR_CODES);
export const apiErrorSchema = z.object({
    code: errorCodeSchema,
    message: z.string(),
    field: z.string().optional(),
    retryable: z.boolean(),
    requestId: z.string(),
});
export const emailSchema = z.string().trim().min(3).max(254).refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), { message: "Enter a valid email address." });
export const passwordSchema = z.string().min(12).max(200);
export const sessionUserSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().nullable(),
    isGuest: z.boolean(),
    csrfToken: z.string(),
});
export const registerRequestSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
});
export const loginRequestSchema = z.object({
    email: emailSchema,
    password: z.string().min(1).max(200),
});
export const recoveryRequestSchema = z.object({ email: emailSchema });
export const resetPasswordRequestSchema = z.object({
    token: z.string().min(20).max(200),
    password: passwordSchema,
});
/* ---------------------------------- catalog --------------------------------- */
export const productSchema = z.object({
    sku: z.string(),
    name: z.string(),
    description: z.string(),
    imageUrl: z.string(),
    unitPriceMinor: z.number().int().nonnegative(),
    currency: z.string().length(3),
    available: z.boolean(),
    availableQuantity: z.number().int().nonnegative(),
    maxQuantity: z.number().int().positive(),
});
export const cartItemSchema = z.object({
    sku: z.string(),
    name: z.string(),
    quantity: z.number().int().positive(),
    unitPriceMinor: z.number().int().nonnegative(),
    available: z.boolean(),
});
export const cartSchema = z.object({
    id: z.string().uuid(),
    currency: z.string().length(3),
    items: z.array(cartItemSchema),
});
export const setQuantityRequestSchema = z.object({
    sku: z.string().min(1),
    quantity: z.number().int().min(0).max(100),
});
/* --------------------------------- shipping --------------------------------- */
export const addressSchema = z.object({
    line1: z.string().trim().min(3).max(120),
    line2: z.string().trim().max(120).default(""),
    city: z.string().trim().min(2).max(80),
    postalCode: z.string().trim().min(2).max(20),
    countryCode: z.string().trim().length(2).toUpperCase(),
});
export const shippingMethodSchema = z.enum(["standard", "express", "overnight"]);
export const shippingOptionSchema = z.object({
    method: shippingMethodSchema,
    label: z.string(),
    priceMinor: z.number().int().nonnegative(),
    currency: z.string().length(3),
    etaMinDays: z.number().int().nonnegative(),
    etaMaxDays: z.number().int().nonnegative(),
    available: z.boolean(),
});
/* --------------------------------- pricing ---------------------------------- */
export const quoteLineSchema = z.object({
    kind: z.enum(["subtotal", "discount", "tax", "shipping", "total"]),
    label: z.string(),
    amountMinor: z.number().int(),
});
export const quoteSchema = z.object({
    id: z.string().uuid(),
    cartId: z.string().uuid(),
    version: z.number().int().positive(),
    expiresAt: z.string(),
    currency: z.string().length(3),
    taxInclusive: z.boolean(),
    roundingRule: z.string(),
    sku: z.string(),
    quantity: z.number().int().positive(),
    unitPriceMinor: z.number().int().nonnegative(),
    availability: z.enum(["in_stock", "low_stock", "reserved"]),
    discountMinor: z.number().int().nonnegative(),
    promotionCode: z.string().nullable(),
    taxMinor: z.number().int().nonnegative(),
    shippingMinor: z.number().int().nonnegative(),
    shippingMethod: shippingMethodSchema,
    subtotalMinor: z.number().int().nonnegative(),
    totalMinor: z.number().int().nonnegative(),
    lines: z.array(quoteLineSchema),
    address: addressSchema,
    quoteToken: z.string(),
});
export const createQuoteRequestSchema = z.object({
    address: addressSchema,
    shippingMethod: shippingMethodSchema,
    promotionCode: z.string().trim().max(40).optional(),
});
export const promotionResultSchema = z.object({
    code: z.string(),
    valid: z.boolean(),
    description: z.string(),
    discountMinor: z.number().int().nonnegative(),
});
/* --------------------------------- payment ---------------------------------- */
export const paymentMethodSchema = z.enum(["card", "paypal"]);
export const paymentStatusSchema = z.enum([
    "pending",
    "requires_action",
    "paid",
    "failed",
    "canceled",
    "refunded",
    "disputed",
]);
export const paymentSchema = z.object({
    id: z.string().uuid(),
    orderId: z.string().uuid(),
    orderNumber: z.string(),
    provider: z.string(),
    method: paymentMethodSchema,
    status: paymentStatusSchema,
    brand: z.string().nullable(),
    last4: z.string().nullable(),
    amountMinor: z.number().int().nonnegative(),
    currency: z.string().length(3),
    checkoutUrl: z.string().nullable(),
    expiresAt: z.string().nullable(),
    returnUrl: z.string(),
});
export const createPaymentRequestSchema = z.object({
    orderId: z.string().uuid(),
    method: paymentMethodSchema,
});
export const hostedFieldsSchema = z.object({
    sessionId: z.string().uuid(),
    provider: z.string(),
    mode: z.enum(["test", "sandbox", "live"]),
    status: paymentStatusSchema,
    card: z.object({
        label: z.string(),
        placeholder: z.string(),
    }),
    expiry: z.object({ label: z.string(), placeholder: z.string() }),
    cvc: z.object({ label: z.string(), placeholder: z.string() }),
    message: z.string(),
    actionLabel: z.string(),
});
/* ---------------------------------- orders ---------------------------------- */
export const consentRecordSchema = z.object({
    necessary: z.literal(true),
    marketing: z.boolean(),
    version: z.string(),
    recordedAt: z.string(),
});
export const orderStatusSchema = z.enum([
    "awaiting_payment",
    "paid",
    "failed",
    "canceled",
    "refunded",
    "disputed",
]);
export const fulfillmentStatusSchema = z.enum([
    "unfulfilled",
    "processing",
    "shipped",
    "delivered",
]);
export const createOrderRequestSchema = z.object({
    quoteId: z.string().uuid(),
    quoteVersion: z.number().int().positive(),
    quoteToken: z.string().min(10),
    address: addressSchema,
    shippingMethod: shippingMethodSchema,
    consentNecessary: z.literal(true),
    consentMarketing: z.boolean().default(false),
    consentVersion: z.string().min(1).max(40),
});
export const orderItemSchema = z.object({
    sku: z.string(),
    name: z.string(),
    quantity: z.number().int().positive(),
    unitPriceMinor: z.number().int().nonnegative(),
    lineTotalMinor: z.number().int().nonnegative(),
});
export const receiptSchema = z.object({
    merchant: z.string(),
    orderNumber: z.string(),
    transactionReference: z.string().nullable(),
    paidAt: z.string().nullable(),
    currency: z.string().length(3),
    totalMinor: z.number().int().nonnegative(),
    paymentBrand: z.string().nullable(),
    last4: z.string().nullable(),
    policyVersion: z.string(),
});
export const orderSchema = z.object({
    id: z.string().uuid(),
    number: z.string(),
    status: orderStatusSchema,
    paymentStatus: paymentStatusSchema,
    fulfillmentStatus: fulfillmentStatusSchema,
    currency: z.string().length(3),
    totalMinor: z.number().int().nonnegative(),
    createdAt: z.string(),
    confirmationUrl: z.string(),
    items: z.array(orderItemSchema),
    address: addressSchema,
    consents: z.array(consentRecordSchema),
    receipt: receiptSchema.nullable(),
    message: z.string().nullable(),
});
export const refundRequestSchema = z.object({
    orderId: z.string().uuid(),
    amountMinor: z.number().int().positive().optional(),
    reason: z.string().trim().min(3).max(200),
});
/* -------------------------------- compliance -------------------------------- */
export const launchGateStatusSchema = z.enum(["verified", "pending", "unsupported"]);
export const launchGateSchema = z.object({
    id: z.string(),
    label: z.string(),
    status: launchGateStatusSchema,
    detail: z.string(),
});
export const policyLinksSchema = z.object({
    terms: z.string(),
    privacy: z.string(),
    delivery: z.string(),
    returns: z.string(),
    refund: z.string(),
});
export const complianceConfigSchema = z.object({
    sellerLegalEntity: z.string(),
    supportedCountries: z.array(z.string().length(2)),
    currencies: z.array(z.string().length(3)),
    b2bMode: z.boolean(),
    taxInclusive: z.boolean(),
    policies: policyLinksSchema,
    policyVersion: z.string(),
    privacyController: z.string(),
    privacyContact: z.string(),
    retention: z.object({
        ordersMonths: z.number().int().nonnegative(),
        sessionsDays: z.number().int().nonnegative(),
        analyticsDays: z.number().int().nonnegative(),
    }),
    restrictions: z.object({
        minimumAge: z.number().int().nonnegative(),
        restrictedCategories: z.array(z.string()),
    }),
    cookies: z.array(z.object({
        name: z.string(),
        purpose: z.string(),
        necessary: z.boolean(),
        retentionDays: z.number().int().nonnegative(),
    })),
    paymentMethods: z.array(z.string()),
    providerMode: z.enum(["test", "sandbox", "live"]),
    liveCheckoutEnabled: z.boolean(),
    reviewedAt: z.string().nullable(),
    reviewedBy: z.string().nullable(),
    launchGates: z.array(launchGateSchema),
});
export const consentVersionSchema = z.object({ version: z.string() });
export const privacyRequestSchema = z.object({
    type: z.enum(["access", "correction", "export", "deletion"]),
    contact: z.string().min(3).max(254),
    details: z.string().trim().max(1000).default(""),
});
export const privacyExportSchema = z.object({
    customerId: z.string().uuid(),
    email: z.string().nullable(),
    name: z.string(),
    carts: z.array(cartSchema),
    orders: z.array(orderSchema),
    consents: z.array(consentRecordSchema),
    generatedAt: z.string(),
});
/* --------------------------------- bootstrap -------------------------------- */
export const bootstrapSchema = z.object({
    user: sessionUserSchema.nullable(),
    product: productSchema,
    cart: cartSchema,
    shippingOptions: z.array(shippingOptionSchema),
    quote: quoteSchema.nullable(),
    compliance: complianceConfigSchema,
    message: z.string().nullable(),
});
export function isApiError(value) {
    return apiErrorSchema.safeParse(value).success;
}
