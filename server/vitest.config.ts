import { defineConfig } from "vitest/config";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://checkout:checkout@localhost:55432/checkout_test";
process.env.SESSION_SECRET ??= "test-session-secret-at-least-32-characters";
process.env.CSRF_SECRET ??= "test-csrf-secret-at-least-32-characters";
process.env.PAYMENT_WEBHOOK_SECRET ??= "test-webhook-secret-at-least-32-characters";
process.env.PAYMENT_PROVIDER ??= "test";
process.env.CHECKOUT_TEST_MODE ??= "true";
process.env.PUBLIC_WEB_ORIGIN ??= "http://localhost:5173";
process.env.COOKIE_SECURE ??= "false";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
