import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

// The repository root holds the shared development .env; workspace cwd may vary.
dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
dotenv.config();

export type ProviderMode = "test" | "sandbox" | "live";

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function requireSecret(name: string, minimumLength = 32): string {
  const value = read(name);
  if (!value) {
    throw new Error(`Missing required configuration: ${name}. See .env.example.`);
  }
  if (value.length < minimumLength) {
    throw new Error(`${name} must be at least ${minimumLength} characters.`);
  }
  return value;
}

const nodeEnv = read("NODE_ENV") ?? "development";
const providerMode = (read("PAYMENT_PROVIDER") ?? "test") as ProviderMode;
const requestedPoolMax = Number(read("DB_POOL_MAX") ?? "10");
const dbPoolMax = Number.isFinite(requestedPoolMax) ? Math.max(1, Math.floor(requestedPoolMax)) : 10;

export const config = {
  nodeEnv,
  isTest: nodeEnv === "test",
  isProduction: nodeEnv === "production",
  port: Number(read("PORT") ?? "3001"),
  databaseUrl: requireSecret("DATABASE_URL", 8),
  dbPoolMax,
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
  emailSender: read("EMAIL_SENDER") ?? "outbox",
} as const;

if (!["test", "sandbox", "live"].includes(config.providerMode)) {
  throw new Error("PAYMENT_PROVIDER must be one of: test, sandbox, live.");
}
if (config.providerMode !== "test") {
  throw new Error(
    `PAYMENT_PROVIDER=${config.providerMode} is not supported: no live/sandbox vendor adapter is registered. ` +
      "Keep the provider-neutral interface and supply an adapter after provider selection.",
  );
}
if (config.providerMode === "test" && !config.checkoutTestMode) {
  throw new Error("CHECKOUT_TEST_MODE must be true when PAYMENT_PROVIDER=test.");
}
if (config.isProduction && !config.cookieSecure) {
  throw new Error("COOKIE_SECURE=true is required in production.");
}
