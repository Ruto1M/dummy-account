import { withTransaction } from "../db.js";
import { migrations } from "./index.js";

export async function runMigrations(): Promise<void> {
  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(918273645)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    for (const migration of migrations) {
      const existing = await client.query(
        "SELECT 1 FROM schema_migrations WHERE name = $1",
        [migration.name],
      );
      if (existing.rowCount) continue;
      await client.query(migration.up);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migration.name]);
    }
  });
}
