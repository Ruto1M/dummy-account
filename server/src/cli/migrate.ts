import { runMigrations } from "../migrations/run.js";
import { assertDatabase, closeDatabase } from "../db.js";
import { logger } from "../logger.js";

await assertDatabase();
await runMigrations();
logger.info("Migrations applied");
await closeDatabase();
