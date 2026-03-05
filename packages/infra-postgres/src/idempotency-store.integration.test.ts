import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IdempotencyRecord } from "@grantledger/contracts";
import type { Pool } from "pg";
import { createPostgresAsyncIdempotencyStore, createPostgresPool } from "./index.js";

const shouldRun =
  process.env.RUN_PG_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const describePg = shouldRun ? describe : describe.skip;

type PostgresIdempotencyStore<T> = ReturnType<
  typeof createPostgresAsyncIdempotencyStore<T>
>;

function beginOrThrow<TResponse>(
  store: PostgresIdempotencyStore<TResponse>,
): NonNullable<PostgresIdempotencyStore<TResponse>["begin"]> {
  if (!store.begin) {
    throw new Error("Postgres idempotency store must implement begin()");
  }
  return store.begin;
}

async function applyMigrations(pool: Pool): Promise<void> {
  const migrations = [
    "db/migrations/0001_arch_015_core_tables.sql",
    "db/migrations/0002_arch_016_worker_lease.sql",
  ];

  for (const migrationPath of migrations) {
    const sql = readFileSync(resolve(process.cwd(), migrationPath), "utf8");
    await pool.query(sql);
  }
}

describePg("postgres idempotency store regression", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createPostgresPool();
    await applyMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("begins, blocks concurrent begin, and replays completed result for same hash", async () => {
    const tenantId = `t_idem_${randomUUID().slice(0, 8)}`;
    const store = createPostgresAsyncIdempotencyStore<{ ok: boolean }>(pool, tenantId);
    const begin = beginOrThrow(store);

    const scope = "invoice.enqueue";
    const key = `idem_${randomUUID()}`;
    const hash = `hash_${randomUUID()}`;
    const now = new Date().toISOString();

    const started = await begin(scope, key, hash, now);
    expect(started).toEqual({ outcome: "started" });

    const inProgress = await begin(scope, key, hash, new Date().toISOString());
    expect(inProgress).toEqual({ outcome: "in_progress" });

    const completedRecord: IdempotencyRecord<{ ok: boolean }> = {
      key,
      payloadHash: hash,
      status: "completed",
      response: { ok: true },
      createdAt: now,
      updatedAt: now,
    };

    await store.set(scope, key, completedRecord);

    const replay = await begin(scope, key, hash, new Date().toISOString());
    expect(replay.outcome).toBe("replay");
    if (replay.outcome !== "replay") throw new Error("expected replay outcome");
    expect(replay.record.status).toBe("completed");
    expect(replay.record.response).toEqual({ ok: true });
  });

  it("returns conflict when same key is reused with different payload hash", async () => {
    const tenantId = `t_idem_${randomUUID().slice(0, 8)}`;
    const store = createPostgresAsyncIdempotencyStore<{ ok: boolean }>(pool, tenantId);
    const begin = beginOrThrow(store);

    const scope = "invoice.enqueue";
    const key = `idem_${randomUUID()}`;
    const hashA = `hash_${randomUUID()}`;
    const hashB = `hash_${randomUUID()}`;

    const started = await begin(scope, key, hashA, new Date().toISOString());
    expect(started).toEqual({ outcome: "started" });

    const conflict = await begin(scope, key, hashB, new Date().toISOString());
    expect(conflict).toEqual({ outcome: "conflict" });
  });

  it("restarts a failed record as processing and clears stale failure payload", async () => {
    const tenantId = `t_idem_${randomUUID().slice(0, 8)}`;
    const store = createPostgresAsyncIdempotencyStore<{ ok: boolean }>(pool, tenantId);
    const begin = beginOrThrow(store);

    const scope = "invoice.enqueue";
    const key = `idem_${randomUUID()}`;
    const hash = `hash_${randomUUID()}`;
    const now = new Date().toISOString();

    await store.set(scope, key, {
      key,
      payloadHash: hash,
      status: "failed",
      errorMessage: "boom",
      createdAt: now,
      updatedAt: now,
    });

    const restarted = await begin(scope, key, hash, new Date().toISOString());
    expect(restarted).toEqual({ outcome: "started" });

    const current = await store.get(scope, key);
    expect(current?.status).toBe("processing");
    expect(current?.errorMessage).toBeUndefined();
    expect(current?.response).toBeUndefined();
  });

  it("treats same key in different scopes as independent records", async () => {
    const tenantId = `t_idem_${randomUUID().slice(0, 8)}`;
    const store = createPostgresAsyncIdempotencyStore<{ ok: boolean }>(pool, tenantId);
    const begin = beginOrThrow(store);

    const key = `idem_${randomUUID()}`;
    const hash = `hash_${randomUUID()}`;
    const startedAt = new Date().toISOString();

    const beginA = await begin("invoice.enqueue", key, hash, startedAt);
    const beginB = await begin("invoice.process", key, hash, startedAt);

    expect(beginA).toEqual({ outcome: "started" });
    expect(beginB).toEqual({ outcome: "started" });
  });
});
