import type { Request } from "express";
import type { PoolClient } from "pg";
import { createHash } from "node:crypto";
import { AppError, errors } from "../errors.js";
import { query, withTransaction } from "../db.js";
import { tokenHash } from "./security.js";

export function readIdempotencyKey(req: Request): string {
  const key = req.header("idempotency-key");
  if (!key || !/^[A-Za-z0-9_-]{12,100}$/.test(key)) {
    throw errors.validation("A valid Idempotency-Key header is required.", "idempotency-key");
  }
  return key;
}

export interface IdempotentResult<T> {
  value: T;
  replayed: boolean;
}

export async function runIdempotent<T>(
  options: {
    customerId: string;
    scope: string;
    key: string;
    request: unknown;
    work: (client: PoolClient) => Promise<T>;
  },
): Promise<IdempotentResult<T>> {
  const keyHash = tokenHash(options.key);
  const requestHash = createHash("sha256").update(JSON.stringify(options.request ?? null)).digest("hex");

  return withTransaction(async (client) => {
    const inserted = await query<{ id: string }>(
      `INSERT INTO idempotency_keys (key_hash, customer_id, scope, request_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (customer_id, scope, key_hash) DO NOTHING
       RETURNING id`,
      [keyHash, options.customerId, options.scope, requestHash],
      client,
    );

    if (!inserted.rowCount) {
      const existing = await query<{ request_hash: string; status: string; response: T | null }>(
        `SELECT request_hash, status, response FROM idempotency_keys
          WHERE customer_id = $1 AND scope = $2 AND key_hash = $3`,
        [options.customerId, options.scope, keyHash],
        client,
      );
      const row = existing.rows[0];
      if (!row || row.request_hash !== requestHash) throw errors.idempotencyConflict();
      if (row.status !== "completed" || row.response === null) {
        throw new AppError({
          code: "CONFLICT",
          message: "A duplicate request is still being processed. Retry shortly.",
          status: 409,
          retryable: true,
        });
      }
      return { value: row.response, replayed: true };
    }

    const value = await options.work(client);
    await query(
      `UPDATE idempotency_keys SET status = 'completed', response = $1::jsonb
        WHERE customer_id = $2 AND scope = $3 AND key_hash = $4`,
      [JSON.stringify(value), options.customerId, options.scope, keyHash],
      client,
    );
    return { value, replayed: false };
  });
}
