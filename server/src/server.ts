import { createApp } from "./app.js";
import { config } from "./config.js";
import { closeDatabase } from "./db.js";
import { logger } from "./logger.js";
import { runMigrations } from "./migrations/run.js";

async function main(): Promise<void> {
  await runMigrations();
  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info({
      port: config.port,
      providerMode: config.providerMode,
      webOrigin: config.publicWebOrigin,
    }, "checkout API listening");
  });
  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutting down");
    server.close(() => { void closeDatabase().then(() => process.exit(0)); });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  logger.error({ err: error instanceof Error ? error.message : String(error) }, "startup failed");
  process.exit(1);
});
