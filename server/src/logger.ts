import pino from "pino";
import { config } from "./config.js";

export const logger = pino({
  level: config.logLevel,
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "req.body.password",
      "req.body.cardNumber",
      "req.body.cvv",
      "req.body.expiry",
      "req.body.quoteToken",
      "*.password",
      "*.cardNumber",
      "*.cvv",
      "*.token",
      "*.csrfToken",
    ],
    censor: "[REDACTED]",
  },
  base: { service: "checkout-api", environment: config.nodeEnv },
});

export type LogFields = Record<string, string | number | boolean | null | undefined>;

export function audit(action: string, fields: LogFields = {}): void {
  logger.info({ event: "audit", action, ...fields }, "audit event");
}
