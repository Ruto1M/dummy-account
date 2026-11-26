import pg from "pg";
import { config } from "./config.js";
import { logger } from "./logger.js";

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (error) => {
  logger.error({ err: error.message }, "idle PostgreSQL client error");
});

export type Queryable = pg.Pool | pg.PoolClient;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  client: Queryable = pool,
): Promise<pg.QueryResult<T>> {
  return client.query<T>(sql, params as never[]);
}

export async function withTransaction<T>(
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function assertDatabase(): Promise<void> {
  await query("SELECT 1");
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
