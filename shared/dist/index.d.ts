/**
 * Shared, validated contracts for the browser and the server.
 * All money values are INTEGER MINOR UNITS (e.g. pence), never floats.
 */
import { z } from "zod";
export declare const ERROR_CODES: readonly ["VALIDATION_ERROR", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "RATE_LIMITED", "QUOTE_EXPIRED", "PAYMENT_PENDING", "PAYMENT_DECLINED", "PAYMENT_CANCELLED", "INVENTORY_CHANGED", "IDEMPOTENCY_CONFLICT", "LAUNCH_GATE_BLOCKED", "UPSTREAM_UNAVAILABLE", "CSRF_FAILED", "INTERNAL"];
export declare const errorCodeSchema: z.ZodEnum<{
    VALIDATION_ERROR: "VALIDATION_ERROR";
    UNAUTHORIZED: "UNAUTHORIZED";
    FORBIDDEN: "FORBIDDEN";
    NOT_FOUND: "NOT_FOUND";
    CONFLICT: "CONFLICT";
    RATE_LIMITED: "RATE_LIMITED";
    QUOTE_EXPIRED: "QUOTE_EXPIRED";
    PAYMENT_PENDING: "PAYMENT_PENDING";
    PAYMENT_DECLINED: "PAYMENT_DECLINED";
    PAYMENT_CANCELLED: "PAYMENT_CANCELLED";
    INVENTORY_CHANGED: "INVENTORY_CHANGED";
    IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT";
    LAUNCH_GATE_BLOCKED: "LAUNCH_GATE_BLOCKED";
    UPSTREAM_UNAVAILABLE: "UPSTREAM_UNAVAILABLE";
    CSRF_FAILED: "CSRF_FAILED";
    INTERNAL: "INTERNAL";
}>;
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export declare const apiErrorSchema: z.ZodObject<{
    code: z.ZodEnum<{
        VALIDATION_ERROR: "VALIDATION_ERROR";
        UNAUTHORIZED: "UNAUTHORIZED";
        FORBIDDEN: "FORBIDDEN";
        NOT_FOUND: "NOT_FOUND";
        CONFLICT: "CONFLICT";
        RATE_LIMITED: "RATE_LIMITED";
        QUOTE_EXPIRED: "QUOTE_EXPIRED";
        PAYMENT_PENDING: "PAYMENT_PENDING";
        PAYMENT_DECLINED: "PAYMENT_DECLINED";
        PAYMENT_CANCELLED: "PAYMENT_CANCELLED";
        INVENTORY_CHANGED: "INVENTORY_CHANGED";
        IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT";
        LAUNCH_GATE_BLOCKED: "LAUNCH_GATE_BLOCKED";
        UPSTREAM_UNAVAILABLE: "UPSTREAM_UNAVAILABLE";
        CSRF_FAILED: "CSRF_FAILED";
        INTERNAL: "INTERNAL";
    }>;
    message: z.ZodString;
    field: z.ZodOptional<z.ZodString>;
    retryable: z.ZodBoolean;
    requestId: z.ZodString;
}, z.core.$strip>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export declare const emailSchema: z.ZodString;
export declare const passwordSchema: z.ZodString;
export declare const sessionUserSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    email: z.ZodNullable<z.ZodString>;
    isGuest: z.ZodBoolean;
    csrfToken: z.ZodString;
}, z.core.$strip>;
export type SessionUser = z.infer<typeof sessionUserSchema>;
export declare const registerRequestSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, z.core.$strip>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export declare const loginRequestSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, z.core.$strip>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export declare const recoveryRequestSchema: z.ZodObject<{
    email: z.ZodString;
}, z.core.$strip>;
export type RecoveryRequest = z.infer<typeof recoveryRequestSchema>;
export declare const resetPasswordRequestSchema: z.ZodObject<{
    token: z.ZodString;
    password: z.ZodString;
}, z.core.$strip>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export declare const productSchema: z.ZodObject<{
    sku: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    imageUrl: z.ZodString;
    unitPriceMinor: z.ZodNumber;
    currency: z.ZodString;
    available: z.ZodBoolean;
    availableQuantity: z.ZodNumber;
    maxQuantity: z.ZodNumber;
}, z.core.$strip>;
export type Product = z.infer<typeof productSchema>;
export declare const cartItemSchema: z.ZodObject<{
    sku: z.ZodString;
    name: z.ZodString;
    quantity: z.ZodNumber;
    unitPriceMinor: z.ZodNumber;
    available: z.ZodBoolean;
}, z.core.$strip>;
export type CartItem = z.infer<typeof cartItemSchema>;
export declare const cartSchema: z.ZodObject<{
    id: z.ZodString;
    currency: z.ZodString;
    items: z.ZodArray<z.ZodObject<{
        sku: z.ZodString;
        name: z.ZodString;
        quantity: z.ZodNumber;
        unitPriceMinor: z.ZodNumber;
        available: z.ZodBoolean;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type Cart = z.infer<typeof cartSchema>;
export declare const setQuantityRequestSchema: z.ZodObject<{
    sku: z.ZodString;
    quantity: z.ZodNumber;
}, z.core.$strip>;
export type SetQuantityRequest = z.infer<typeof setQuantityRequestSchema>;
export declare const addressSchema: z.ZodObject<{
    line1: z.ZodString;
    line2: z.ZodDefault<z.ZodString>;
    city: z.ZodString;
    postalCode: z.ZodString;
    countryCode: z.ZodString;
}, z.core.$strip>;
export type Address = z.infer<typeof addressSchema>;
export declare const shippingMethodSchema: z.ZodEnum<{
    standard: "standard";
    express: "express";
    overnight: "overnight";
}>;
export type ShippingMethod = z.infer<typeof shippingMethodSchema>;
export declare const shippingOptionSchema: z.ZodObject<{
    method: z.ZodEnum<{
        standard: "standard";
        express: "express";
        overnight: "overnight";
    }>;
    label: z.ZodString;
    priceMinor: z.ZodNumber;
    currency: z.ZodString;
    etaMinDays: z.ZodNumber;
    etaMaxDays: z.ZodNumber;
    available: z.ZodBoolean;
}, z.core.$strip>;
export type ShippingOption = z.infer<typeof shippingOptionSchema>;
export declare const quoteLineSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        subtotal: "subtotal";
        discount: "discount";
        tax: "tax";
        shipping: "shipping";
        total: "total";
    }>;
    label: z.ZodString;
    amountMinor: z.ZodNumber;
}, z.core.$strip>;
export type QuoteLine = z.infer<typeof quoteLineSchema>;
export declare const quoteSchema: z.ZodObject<{
    id: z.ZodString;
    cartId: z.ZodString;
    version: z.ZodNumber;
    expiresAt: z.ZodString;
    currency: z.ZodString;
    taxInclusive: z.ZodBoolean;
    roundingRule: z.ZodString;
    sku: z.ZodString;
    quantity: z.ZodNumber;
    unitPriceMinor: z.ZodNumber;
    availability: z.ZodEnum<{
        in_stock: "in_stock";
        low_stock: "low_stock";
        reserved: "reserved";
    }>;
    discountMinor: z.ZodNumber;
    promotionCode: z.ZodNullable<z.ZodString>;
    taxMinor: z.ZodNumber;
    shippingMinor: z.ZodNumber;
    shippingMethod: z.ZodEnum<{
        standard: "standard";
        express: "express";
        overnight: "overnight";
    }>;
    subtotalMinor: z.ZodNumber;
    totalMinor: z.ZodNumber;
    lines: z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<{
            subtotal: "subtotal";
            discount: "discount";
            tax: "tax";
            shipping: "shipping";
            total: "total";
        }>;
        label: z.ZodString;
        amountMinor: z.ZodNumber;
    }, z.core.$strip>>;
    address: z.ZodObject<{
        line1: z.ZodString;
        line2: z.ZodDefault<z.ZodString>;
        city: z.ZodString;
        postalCode: z.ZodString;
        countryCode: z.ZodString;
    }, z.core.$strip>;
    quoteToken: z.ZodString;
}, z.core.$strip>;
export type Quote = z.infer<typeof quoteSchema>;
export declare const createQuoteRequestSchema: z.ZodObject<{
    address: z.ZodObject<{
        line1: z.ZodString;
        line2: z.ZodDefault<z.ZodString>;
        city: z.ZodString;
        postalCode: z.ZodString;
        countryCode: z.ZodString;
    }, z.core.$strip>;
    shippingMethod: z.ZodEnum<{
        standard: "standard";
        express: "express";
        overnight: "overnight";
    }>;
    promotionCode: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type CreateQuoteRequest = z.infer<typeof createQuoteRequestSchema>;
export declare const promotionResultSchema: z.ZodObject<{
    code: z.ZodString;
    valid: z.ZodBoolean;
    description: z.ZodString;
    discountMinor: z.ZodNumber;
}, z.core.$strip>;
export type PromotionResult = z.infer<typeof promotionResultSchema>;
export declare const paymentMethodSchema: z.ZodEnum<{
    card: "card";
    paypal: "paypal";
}>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export declare const paymentStatusSchema: z.ZodEnum<{
    pending: "pending";
    requires_action: "requires_action";
    paid: "paid";
    failed: "failed";
    canceled: "canceled";
    refunded: "refunded";
    disputed: "disputed";
}>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export declare const paymentSchema: z.ZodObject<{
    id: z.ZodString;
    orderId: z.ZodString;
    orderNumber: z.ZodString;
    provider: z.ZodString;
    method: z.ZodEnum<{
        card: "card";
        paypal: "paypal";
    }>;
    status: z.ZodEnum<{
        pending: "pending";
        requires_action: "requires_action";
        paid: "paid";
        failed: "failed";
        canceled: "canceled";
        refunded: "refunded";
        disputed: "disputed";
    }>;
    brand: z.ZodNullable<z.ZodString>;
    last4: z.ZodNullable<z.ZodString>;
    amountMinor: z.ZodNumber;
    currency: z.ZodString;
    checkoutUrl: z.ZodNullable<z.ZodString>;
    expiresAt: z.ZodNullable<z.ZodString>;
    returnUrl: z.ZodString;
}, z.core.$strip>;
export type Payment = z.infer<typeof paymentSchema>;
export declare const createPaymentRequestSchema: z.ZodObject<{
    orderId: z.ZodString;
    method: z.ZodEnum<{
        card: "card";
        paypal: "paypal";
    }>;
}, z.core.$strip>;
export type CreatePaymentRequest = z.infer<typeof createPaymentRequestSchema>;
export declare const hostedFieldsSchema: z.ZodObject<{
    sessionId: z.ZodString;
    provider: z.ZodString;
    mode: z.ZodEnum<{
        test: "test";
        sandbox: "sandbox";
        live: "live";
    }>;
    status: z.ZodEnum<{
        pending: "pending";
        requires_action: "requires_action";
        paid: "paid";
        failed: "failed";
        canceled: "canceled";
        refunded: "refunded";
        disputed: "disputed";
    }>;
    card: z.ZodObject<{
        label: z.ZodString;
        placeholder: z.ZodString;
    }, z.core.$strip>;
    expiry: z.ZodObject<{
        label: z.ZodString;
        placeholder: z.ZodString;
    }, z.core.$strip>;
    cvc: z.ZodObject<{
        label: z.ZodString;
        placeholder: z.ZodString;
    }, z.core.$strip>;
    message: z.ZodString;
    actionLabel: z.ZodString;
}, z.core.$strip>;
export type HostedFields = z.infer<typeof hostedFieldsSchema>;
export declare const consentRecordSchema: z.ZodObject<{
    necessary: z.ZodLiteral<true>;
    marketing: z.ZodBoolean;
    version: z.ZodString;
    recordedAt: z.ZodString;
}, z.core.$strip>;
export type ConsentRecord = z.infer<typeof consentRecordSchema>;
export declare const orderStatusSchema: z.ZodEnum<{
    paid: "paid";
    failed: "failed";
    canceled: "canceled";
    refunded: "refunded";
    disputed: "disputed";
    awaiting_payment: "awaiting_payment";
}>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export declare const fulfillmentStatusSchema: z.ZodEnum<{
    unfulfilled: "unfulfilled";
    processing: "processing";
    shipped: "shipped";
    delivered: "delivered";
}>;
export type FulfillmentStatus = z.infer<typeof fulfillmentStatusSchema>;
export declare const createOrderRequestSchema: z.ZodObject<{
    quoteId: z.ZodString;
    quoteVersion: z.ZodNumber;
    quoteToken: z.ZodString;
    address: z.ZodObject<{
        line1: z.ZodString;
        line2: z.ZodDefault<z.ZodString>;
        city: z.ZodString;
        postalCode: z.ZodString;
        countryCode: z.ZodString;
    }, z.core.$strip>;
    shippingMethod: z.ZodEnum<{
        standard: "standard";
        express: "express";
        overnight: "overnight";
    }>;
    consentNecessary: z.ZodLiteral<true>;
    consentMarketing: z.ZodDefault<z.ZodBoolean>;
    consentVersion: z.ZodString;
}, z.core.$strip>;
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;
export declare const orderItemSchema: z.ZodObject<{
    sku: z.ZodString;
    name: z.ZodString;
    quantity: z.ZodNumber;
    unitPriceMinor: z.ZodNumber;
    lineTotalMinor: z.ZodNumber;
}, z.core.$strip>;
export type OrderItem = z.infer<typeof orderItemSchema>;
export declare const receiptSchema: z.ZodObject<{
    merchant: z.ZodString;
    orderNumber: z.ZodString;
    transactionReference: z.ZodNullable<z.ZodString>;
    paidAt: z.ZodNullable<z.ZodString>;
    currency: z.ZodString;
    totalMinor: z.ZodNumber;
    paymentBrand: z.ZodNullable<z.ZodString>;
    last4: z.ZodNullable<z.ZodString>;
    policyVersion: z.ZodString;
}, z.core.$strip>;
export type Receipt = z.infer<typeof receiptSchema>;
export declare const orderSchema: z.ZodObject<{
    id: z.ZodString;
    number: z.ZodString;
    status: z.ZodEnum<{
        paid: "paid";
        failed: "failed";
        canceled: "canceled";
        refunded: "refunded";
        disputed: "disputed";
        awaiting_payment: "awaiting_payment";
    }>;
    paymentStatus: z.ZodEnum<{
        pending: "pending";
        requires_action: "requires_action";
        paid: "paid";
        failed: "failed";
        canceled: "canceled";
        refunded: "refunded";
        disputed: "disputed";
    }>;
    fulfillmentStatus: z.ZodEnum<{
        unfulfilled: "unfulfilled";
        processing: "processing";
        shipped: "shipped";
        delivered: "delivered";
    }>;
    currency: z.ZodString;
    totalMinor: z.ZodNumber;
    createdAt: z.ZodString;
    confirmationUrl: z.ZodString;
    items: z.ZodArray<z.ZodObject<{
        sku: z.ZodString;
        name: z.ZodString;
        quantity: z.ZodNumber;
        unitPriceMinor: z.ZodNumber;
        lineTotalMinor: z.ZodNumber;
    }, z.core.$strip>>;
    address: z.ZodObject<{
        line1: z.ZodString;
        line2: z.ZodDefault<z.ZodString>;
        city: z.ZodString;
        postalCode: z.ZodString;
        countryCode: z.ZodString;
    }, z.core.$strip>;
    consents: z.ZodArray<z.ZodObject<{
        necessary: z.ZodLiteral<true>;
        marketing: z.ZodBoolean;
        version: z.ZodString;
        recordedAt: z.ZodString;
    }, z.core.$strip>>;
    receipt: z.ZodNullable<z.ZodObject<{
        merchant: z.ZodString;
        orderNumber: z.ZodString;
        transactionReference: z.ZodNullable<z.ZodString>;
        paidAt: z.ZodNullable<z.ZodString>;
        currency: z.ZodString;
        totalMinor: z.ZodNumber;
        paymentBrand: z.ZodNullable<z.ZodString>;
        last4: z.ZodNullable<z.ZodString>;
        policyVersion: z.ZodString;
    }, z.core.$strip>>;
    message: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type Order = z.infer<typeof orderSchema>;
export declare const refundRequestSchema: z.ZodObject<{
    orderId: z.ZodString;
    amountMinor: z.ZodOptional<z.ZodNumber>;
    reason: z.ZodString;
}, z.core.$strip>;
export type RefundRequest = z.infer<typeof refundRequestSchema>;
export declare const launchGateStatusSchema: z.ZodEnum<{
    pending: "pending";
    verified: "verified";
    unsupported: "unsupported";
}>;
export type LaunchGateStatus = z.infer<typeof launchGateStatusSchema>;
export declare const launchGateSchema: z.ZodObject<{
    id: z.ZodString;
    label: z.ZodString;
    status: z.ZodEnum<{
        pending: "pending";
        verified: "verified";
        unsupported: "unsupported";
    }>;
    detail: z.ZodString;
}, z.core.$strip>;
export type LaunchGate = z.infer<typeof launchGateSchema>;
export declare const policyLinksSchema: z.ZodObject<{
    terms: z.ZodString;
    privacy: z.ZodString;
    delivery: z.ZodString;
    returns: z.ZodString;
    refund: z.ZodString;
}, z.core.$strip>;
export type PolicyLinks = z.infer<typeof policyLinksSchema>;
export declare const complianceConfigSchema: z.ZodObject<{
    sellerLegalEntity: z.ZodString;
    supportedCountries: z.ZodArray<z.ZodString>;
    currencies: z.ZodArray<z.ZodString>;
    b2bMode: z.ZodBoolean;
    taxInclusive: z.ZodBoolean;
    policies: z.ZodObject<{
        terms: z.ZodString;
        privacy: z.ZodString;
        delivery: z.ZodString;
        returns: z.ZodString;
        refund: z.ZodString;
    }, z.core.$strip>;
    policyVersion: z.ZodString;
    privacyController: z.ZodString;
    privacyContact: z.ZodString;
    retention: z.ZodObject<{
        ordersMonths: z.ZodNumber;
        sessionsDays: z.ZodNumber;
        analyticsDays: z.ZodNumber;
    }, z.core.$strip>;
    restrictions: z.ZodObject<{
        minimumAge: z.ZodNumber;
        restrictedCategories: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    cookies: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        purpose: z.ZodString;
        necessary: z.ZodBoolean;
        retentionDays: z.ZodNumber;
    }, z.core.$strip>>;
    paymentMethods: z.ZodArray<z.ZodString>;
    providerMode: z.ZodEnum<{
        test: "test";
        sandbox: "sandbox";
        live: "live";
    }>;
    liveCheckoutEnabled: z.ZodBoolean;
    reviewedAt: z.ZodNullable<z.ZodString>;
    reviewedBy: z.ZodNullable<z.ZodString>;
    launchGates: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
        status: z.ZodEnum<{
            pending: "pending";
            verified: "verified";
            unsupported: "unsupported";
        }>;
        detail: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ComplianceConfig = z.infer<typeof complianceConfigSchema>;
export declare const consentVersionSchema: z.ZodObject<{
    version: z.ZodString;
}, z.core.$strip>;
export type ConsentVersion = z.infer<typeof consentVersionSchema>;
export declare const privacyRequestSchema: z.ZodObject<{
    type: z.ZodEnum<{
        access: "access";
        correction: "correction";
        export: "export";
        deletion: "deletion";
    }>;
    contact: z.ZodString;
    details: z.ZodDefault<z.ZodString>;
}, z.core.$strip>;
export type PrivacyRequest = z.infer<typeof privacyRequestSchema>;
export declare const privacyExportSchema: z.ZodObject<{
    customerId: z.ZodString;
    email: z.ZodNullable<z.ZodString>;
    name: z.ZodString;
    carts: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        currency: z.ZodString;
        items: z.ZodArray<z.ZodObject<{
            sku: z.ZodString;
            name: z.ZodString;
            quantity: z.ZodNumber;
            unitPriceMinor: z.ZodNumber;
            available: z.ZodBoolean;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    orders: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        number: z.ZodString;
        status: z.ZodEnum<{
            paid: "paid";
            failed: "failed";
            canceled: "canceled";
            refunded: "refunded";
            disputed: "disputed";
            awaiting_payment: "awaiting_payment";
        }>;
        paymentStatus: z.ZodEnum<{
            pending: "pending";
            requires_action: "requires_action";
            paid: "paid";
            failed: "failed";
            canceled: "canceled";
            refunded: "refunded";
            disputed: "disputed";
        }>;
        fulfillmentStatus: z.ZodEnum<{
            unfulfilled: "unfulfilled";
            processing: "processing";
            shipped: "shipped";
            delivered: "delivered";
        }>;
        currency: z.ZodString;
        totalMinor: z.ZodNumber;
        createdAt: z.ZodString;
        confirmationUrl: z.ZodString;
        items: z.ZodArray<z.ZodObject<{
            sku: z.ZodString;
            name: z.ZodString;
            quantity: z.ZodNumber;
            unitPriceMinor: z.ZodNumber;
            lineTotalMinor: z.ZodNumber;
        }, z.core.$strip>>;
        address: z.ZodObject<{
            line1: z.ZodString;
            line2: z.ZodDefault<z.ZodString>;
            city: z.ZodString;
            postalCode: z.ZodString;
            countryCode: z.ZodString;
        }, z.core.$strip>;
        consents: z.ZodArray<z.ZodObject<{
            necessary: z.ZodLiteral<true>;
            marketing: z.ZodBoolean;
            version: z.ZodString;
            recordedAt: z.ZodString;
        }, z.core.$strip>>;
        receipt: z.ZodNullable<z.ZodObject<{
            merchant: z.ZodString;
            orderNumber: z.ZodString;
            transactionReference: z.ZodNullable<z.ZodString>;
            paidAt: z.ZodNullable<z.ZodString>;
            currency: z.ZodString;
            totalMinor: z.ZodNumber;
            paymentBrand: z.ZodNullable<z.ZodString>;
            last4: z.ZodNullable<z.ZodString>;
            policyVersion: z.ZodString;
        }, z.core.$strip>>;
        message: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    consents: z.ZodArray<z.ZodObject<{
        necessary: z.ZodLiteral<true>;
        marketing: z.ZodBoolean;
        version: z.ZodString;
        recordedAt: z.ZodString;
    }, z.core.$strip>>;
    generatedAt: z.ZodString;
}, z.core.$strip>;
export type PrivacyExport = z.infer<typeof privacyExportSchema>;
export declare const bootstrapSchema: z.ZodObject<{
    user: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        email: z.ZodNullable<z.ZodString>;
        isGuest: z.ZodBoolean;
        csrfToken: z.ZodString;
    }, z.core.$strip>>;
    product: z.ZodObject<{
        sku: z.ZodString;
        name: z.ZodString;
        description: z.ZodString;
        imageUrl: z.ZodString;
        unitPriceMinor: z.ZodNumber;
        currency: z.ZodString;
        available: z.ZodBoolean;
        availableQuantity: z.ZodNumber;
        maxQuantity: z.ZodNumber;
    }, z.core.$strip>;
    cart: z.ZodObject<{
        id: z.ZodString;
        currency: z.ZodString;
        items: z.ZodArray<z.ZodObject<{
            sku: z.ZodString;
            name: z.ZodString;
            quantity: z.ZodNumber;
            unitPriceMinor: z.ZodNumber;
            available: z.ZodBoolean;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    shippingOptions: z.ZodArray<z.ZodObject<{
        method: z.ZodEnum<{
            standard: "standard";
            express: "express";
            overnight: "overnight";
        }>;
        label: z.ZodString;
        priceMinor: z.ZodNumber;
        currency: z.ZodString;
        etaMinDays: z.ZodNumber;
        etaMaxDays: z.ZodNumber;
        available: z.ZodBoolean;
    }, z.core.$strip>>;
    quote: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        cartId: z.ZodString;
        version: z.ZodNumber;
        expiresAt: z.ZodString;
        currency: z.ZodString;
        taxInclusive: z.ZodBoolean;
        roundingRule: z.ZodString;
        sku: z.ZodString;
        quantity: z.ZodNumber;
        unitPriceMinor: z.ZodNumber;
        availability: z.ZodEnum<{
            in_stock: "in_stock";
            low_stock: "low_stock";
            reserved: "reserved";
        }>;
        discountMinor: z.ZodNumber;
        promotionCode: z.ZodNullable<z.ZodString>;
        taxMinor: z.ZodNumber;
        shippingMinor: z.ZodNumber;
        shippingMethod: z.ZodEnum<{
            standard: "standard";
            express: "express";
            overnight: "overnight";
        }>;
        subtotalMinor: z.ZodNumber;
        totalMinor: z.ZodNumber;
        lines: z.ZodArray<z.ZodObject<{
            kind: z.ZodEnum<{
                subtotal: "subtotal";
                discount: "discount";
                tax: "tax";
                shipping: "shipping";
                total: "total";
            }>;
            label: z.ZodString;
            amountMinor: z.ZodNumber;
        }, z.core.$strip>>;
        address: z.ZodObject<{
            line1: z.ZodString;
            line2: z.ZodDefault<z.ZodString>;
            city: z.ZodString;
            postalCode: z.ZodString;
            countryCode: z.ZodString;
        }, z.core.$strip>;
        quoteToken: z.ZodString;
    }, z.core.$strip>>;
    compliance: z.ZodObject<{
        sellerLegalEntity: z.ZodString;
        supportedCountries: z.ZodArray<z.ZodString>;
        currencies: z.ZodArray<z.ZodString>;
        b2bMode: z.ZodBoolean;
        taxInclusive: z.ZodBoolean;
        policies: z.ZodObject<{
            terms: z.ZodString;
            privacy: z.ZodString;
            delivery: z.ZodString;
            returns: z.ZodString;
            refund: z.ZodString;
        }, z.core.$strip>;
        policyVersion: z.ZodString;
        privacyController: z.ZodString;
        privacyContact: z.ZodString;
        retention: z.ZodObject<{
            ordersMonths: z.ZodNumber;
            sessionsDays: z.ZodNumber;
            analyticsDays: z.ZodNumber;
        }, z.core.$strip>;
        restrictions: z.ZodObject<{
            minimumAge: z.ZodNumber;
            restrictedCategories: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
        cookies: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            purpose: z.ZodString;
            necessary: z.ZodBoolean;
            retentionDays: z.ZodNumber;
        }, z.core.$strip>>;
        paymentMethods: z.ZodArray<z.ZodString>;
        providerMode: z.ZodEnum<{
            test: "test";
            sandbox: "sandbox";
            live: "live";
        }>;
        liveCheckoutEnabled: z.ZodBoolean;
        reviewedAt: z.ZodNullable<z.ZodString>;
        reviewedBy: z.ZodNullable<z.ZodString>;
        launchGates: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            status: z.ZodEnum<{
                pending: "pending";
                verified: "verified";
                unsupported: "unsupported";
            }>;
            detail: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    message: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type Bootstrap = z.infer<typeof bootstrapSchema>;
export declare function isApiError(value: unknown): value is ApiError;
