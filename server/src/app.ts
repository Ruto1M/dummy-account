import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { query } from "./db.js";
import { csrfProtection, errorHandler, requestContext } from "./lib/http.js";
import { metricsSnapshot } from "./metrics.js";
import { bootstrapRouter } from "./modules/bootstrap/routes.js";
import { identityRouter } from "./modules/identity/routes.js";
import { catalogRouter } from "./modules/catalog/routes.js";
import { cartRouter } from "./modules/cart/routes.js";
import { shippingRouter } from "./modules/shipping/routes.js";
import { pricingRouter } from "./modules/pricing/routes.js";
import { ordersRouter } from "./modules/orders/routes.js";
import { paymentRouter } from "./modules/payment/routes.js";
import { complianceRouter } from "./modules/compliance/routes.js";
import { getCompliance } from "./modules/compliance/service.js";

const here = dirname(fileURLToPath(import.meta.url));
const webDist = join(here, "..", "..", "checkout-page", "dist");

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(requestContext);
  app.use(express.json({
    limit: "64kb",
    verify: (req, _res, buffer) => {
      (req as unknown as { rawBody: string }).rawBody = buffer.toString("utf8");
    },
  }));
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));
  app.use(cookieParser());
  app.use(csrfProtection);

  app.get("/api/health", async (_req, res) => {
    try {
      await query("SELECT 1");
      const compliance = await getCompliance();
      res.json({
        ok: true,
        database: "connected",
        providerMode: compliance.providerMode,
        liveCheckoutEnabled: compliance.liveCheckoutEnabled,
        ...metricsSnapshot(),
      });
    } catch {
      res.status(503).json({ ok: false, database: "unavailable" });
    }
  });
  app.get("/api/health/metrics", (_req, res) => res.json(metricsSnapshot()));

  app.use("/api", bootstrapRouter);
  app.use("/api/identity", identityRouter);
  app.use("/api/catalog", catalogRouter);
  app.use("/api", cartRouter);
  app.use("/api", shippingRouter);
  app.use("/api", pricingRouter);
  app.use("/api", ordersRouter);
  app.use("/api", paymentRouter);
  app.use("/api", complianceRouter);

  if (existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(webDist, "index.html")));
  }

  app.use((_req, res) => res.status(404).json({
    code: "NOT_FOUND", message: "Endpoint not found.", retryable: false, requestId: res.locals.requestId,
  }));
  app.use(errorHandler);
  return app;
}

