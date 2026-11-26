import { assertDatabase, closeDatabase } from "../db.js";
import { logger } from "../logger.js";
import { runMigrations } from "../migrations/run.js";
import { reconcilePending } from "../modules/payment/service.js";

await assertDatabase();
await runMigrations();
const result = await reconcilePending();
logger.info(result, "reconciliation finished");
await closeDatabase();
