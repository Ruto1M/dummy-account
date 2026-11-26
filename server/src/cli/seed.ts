import { assertDatabase, closeDatabase } from "../db.js";
import { runMigrations } from "../migrations/run.js";
import { logger } from "../logger.js";
import { seedDatabase } from "../seed.js";

await assertDatabase();
await runMigrations();
await seedDatabase();
logger.info("Seed data applied (test/sandbox values only)");
await closeDatabase();
