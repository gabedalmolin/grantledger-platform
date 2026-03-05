import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  InvoiceJobLeaseError,
  type InvoiceGenerationJob,
} from "@grantledger/application";
import type { GenerateInvoiceForCycleInput } from "@grantledger/contracts";
import type { Pool } from "pg";
import {
  createPostgresInvoiceJobStore,
  createPostgresPool,
} from "./index.js";

const shouldRun =
  process.env.RUN_PG_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const describePg = shouldRun ? describe : describe.skip;

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

function buildInput(tenantId: string): GenerateInvoiceForCycleInput {
  return {
    tenantId,
    subscriptionId: `sub_${randomUUID()}`,
    customerId: `cus_${randomUUID()}`,
    planId: "plan_basic",
    planVersionId: "plan_basic_v1",
    priceAmountInCents: 1990,
    currency: "USD",
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-02-01T00:00:00.000Z",
    calculationVersion: "v1",
    traceId: `trace_${randomUUID()}`,
  };
}

function buildJob(
  tenantId: string,
  overrides: Partial<InvoiceGenerationJob> = {},
): InvoiceGenerationJob {
  const now = new Date().toISOString();

  return {
    id: `job_${randomUUID()}`,
    status: "queued",
    cycleKey: `cycle_${randomUUID()}`,
    input: buildInput(tenantId),
    createdAt: now,
    updatedAt: now,
    attemptCount: 0,
    maxAttempts: 3,
    nextAttemptAt: new Date(Date.now() - 1_000).toISOString(),
    ...overrides,
  };
}

describePg("postgres invoice job store regression", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createPostgresPool();
    await applyMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("does not expose tenant A queued jobs to tenant B", async () => {
    const tenantA = `t_job_a_${randomUUID().slice(0, 8)}`;
    const tenantB = `t_job_b_${randomUUID().slice(0, 8)}`;

    const storeA = createPostgresInvoiceJobStore(pool, tenantA);
    const storeB = createPostgresInvoiceJobStore(pool, tenantB);

    const job = buildJob(tenantA);
    await storeA.enqueue(job);

    const claimedByB = await storeB.claimNext({
      workerId: "worker-b",
      leaseToken: "lease-b",
      leaseSeconds: 30,
    });
    expect(claimedByB).toBeNull();

    const claimedByA = await storeA.claimNext({
      workerId: "worker-a",
      leaseToken: "lease-a",
      leaseSeconds: 30,
    });
    expect(claimedByA?.id).toBe(job.id);
  });

  it("reclaims stale processing lease with a new worker lease", async () => {
    const tenantId = `t_job_${randomUUID().slice(0, 8)}`;
    const store = createPostgresInvoiceJobStore(pool, tenantId);

    const staleJob = buildJob(tenantId, {
      status: "processing",
      leaseOwner: "worker-old",
      leaseToken: "lease-old",
      leaseExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    await store.enqueue(staleJob);

    const reclaimed = await store.claimNext({
      workerId: "worker-new",
      leaseToken: "lease-new",
      leaseSeconds: 45,
    });

    expect(reclaimed?.id).toBe(staleJob.id);
    expect(reclaimed?.leaseOwner).toBe("worker-new");
    expect(reclaimed?.leaseToken).toBe("lease-new");
    expect(reclaimed?.status).toBe("processing");
  });

  it("marks completed and clears lease metadata", async () => {
    const tenantId = `t_job_${randomUUID().slice(0, 8)}`;
    const store = createPostgresInvoiceJobStore(pool, tenantId);

    const job = buildJob(tenantId);
    await store.enqueue(job);

    const leaseInput = {
      workerId: "worker-complete",
      leaseToken: "lease-complete",
      leaseSeconds: 30,
    };

    const claimed = await store.claimNext(leaseInput);
    expect(claimed?.id).toBe(job.id);

    await store.markCompleted(job.id, `inv_${randomUUID()}`, {
      workerId: leaseInput.workerId,
      leaseToken: leaseInput.leaseToken,
    });

    const persisted = await store.get(job.id);
    expect(persisted?.status).toBe("completed");
    expect(persisted?.invoiceId).toBeDefined();
    expect(persisted?.leaseOwner).toBeUndefined();
    expect(persisted?.leaseToken).toBeUndefined();
    expect(persisted?.leaseExpiresAt).toBeUndefined();
  });

  it("marks retry, increments attempts, and releases lease", async () => {
    const tenantId = `t_job_${randomUUID().slice(0, 8)}`;
    const store = createPostgresInvoiceJobStore(pool, tenantId);

    const job = buildJob(tenantId);
    await store.enqueue(job);

    const leaseInput = {
      workerId: "worker-retry",
      leaseToken: "lease-retry",
      leaseSeconds: 30,
    };

    const claimed = await store.claimNext(leaseInput);
    expect(claimed?.id).toBe(job.id);

    const nextAttemptAt = new Date(Date.now() + 10_000).toISOString();
    await store.markRetry(job.id, "transient error", nextAttemptAt, 1, {
      workerId: leaseInput.workerId,
      leaseToken: leaseInput.leaseToken,
    });

    const persisted = await store.get(job.id);
    expect(persisted?.status).toBe("queued");
    expect(persisted?.attemptCount).toBe(1);
    expect(persisted?.reason).toBe("transient error");
    expect(persisted?.lastError).toBe("transient error");
    expect(Date.parse(persisted?.nextAttemptAt ?? "")).toBe(Date.parse(nextAttemptAt));
    expect(persisted?.leaseOwner).toBeUndefined();
    expect(persisted?.leaseToken).toBeUndefined();
    expect(persisted?.leaseExpiresAt).toBeUndefined();
  });

  it("enforces lease ownership on renew and dead-letter transitions", async () => {
    const tenantId = `t_job_${randomUUID().slice(0, 8)}`;
    const store = createPostgresInvoiceJobStore(pool, tenantId);

    const job = buildJob(tenantId);
    await store.enqueue(job);

    const leaseInput = {
      workerId: "worker-owner",
      leaseToken: "lease-owner",
      leaseSeconds: 30,
    };

    const claimed = await store.claimNext(leaseInput);
    expect(claimed?.id).toBe(job.id);

    await expect(
      store.renewLease(
        job.id,
        { workerId: "worker-owner", leaseToken: "lease-other" },
        30,
      ),
    ).rejects.toBeInstanceOf(InvoiceJobLeaseError);

    await expect(
      store.markDeadLetter(job.id, "fatal", {
        workerId: "worker-owner",
        leaseToken: "lease-other",
      }),
    ).rejects.toBeInstanceOf(InvoiceJobLeaseError);
  });
});
