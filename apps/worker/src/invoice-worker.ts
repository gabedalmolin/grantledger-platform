import { randomUUID } from "node:crypto";
import {
  createInMemoryInvoiceOpsMonitor,
  getSharedInvoiceUseCaseDeps,
  processNextInvoiceGenerationJob,
  type InvoiceOpsMonitor,
  type InvoiceOpsSnapshot,
  type InvoiceUseCaseDeps,
} from "@grantledger/application";
import {
  createPostgresInvoiceUseCaseDeps,
  createPostgresPool,
} from "@grantledger/infra-postgres";
import { emitStructuredLog } from "@grantledger/shared";
import { resolveWorkerRuntimeConfig, type WorkerRuntimeConfig } from "./runtime-config.js";

export interface InvoiceWorkerDeps {
  invoiceUseCases: InvoiceUseCaseDeps;
  opsMonitor?: InvoiceOpsMonitor;
}

export interface InvoiceWorkerRuntimeDeps extends InvoiceWorkerDeps {
  close?: () => Promise<void>;
}

export interface RunInvoiceWorkerOnceResult {
  status: "processed" | "idle" | "failed";
  jobId?: string;
}

export interface InvoiceWorkerRuntimeConfig {
  workerId: string;
  leaseSeconds: number;
  heartbeatSeconds: number;
}

const EMPTY_SNAPSHOT: InvoiceOpsSnapshot = {
  queueDepth: 0,
  processingCount: 0,
  completedCount: 0,
  retryScheduledCount: 0,
  deadLetterCount: 0,
  terminalFailureRate: 0,
};

export function resolveInvoiceWorkerRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): InvoiceWorkerRuntimeConfig {
  const workerConfig = resolveWorkerRuntimeConfig(env);

  return {
    workerId: workerConfig.workerId,
    leaseSeconds: workerConfig.leaseSeconds,
    heartbeatSeconds: workerConfig.heartbeatSeconds,
  };
}

export function createDefaultWorkerDeps(
  runtimeConfig: WorkerRuntimeConfig = resolveWorkerRuntimeConfig(),
): InvoiceWorkerRuntimeDeps {
  const opsMonitor = createInMemoryInvoiceOpsMonitor();

  if (runtimeConfig.persistenceDriver !== "postgres") {
    return {
      invoiceUseCases: {
        ...getSharedInvoiceUseCaseDeps(),
        jobObserver: opsMonitor.observer,
      },
      opsMonitor,
    };
  }

  const pool = createPostgresPool({
    ...(runtimeConfig.databaseUrl
      ? { connectionString: runtimeConfig.databaseUrl }
      : {}),
  });
  const workerTenantId = runtimeConfig.workerTenantId;

  if (!workerTenantId) {
    throw new Error("WORKER_TENANT_ID is required when PERSISTENCE_DRIVER=postgres");
  }

  return {
    invoiceUseCases: {
      ...createPostgresInvoiceUseCaseDeps(pool, workerTenantId),
      jobObserver: opsMonitor.observer,
    },
    opsMonitor,
    close: async () => {
      await pool.end();
    },
  };
}

function resolveSnapshot(deps: InvoiceWorkerDeps): InvoiceOpsSnapshot {
  return deps.opsMonitor?.snapshot() ?? EMPTY_SNAPSHOT;
}

let defaultWorkerDeps: InvoiceWorkerRuntimeDeps | undefined;

function resolveDefaultWorkerDeps(): InvoiceWorkerRuntimeDeps {
  if (!defaultWorkerDeps) {
    defaultWorkerDeps = createDefaultWorkerDeps();
  }

  return defaultWorkerDeps;
}

export async function runInvoiceWorkerOnce(
  deps: InvoiceWorkerDeps = resolveDefaultWorkerDeps(),
): Promise<RunInvoiceWorkerOnceResult> {
  const startedAt = Date.now();
  const runtimeConfig = resolveInvoiceWorkerRuntimeConfig();

  const result = await processNextInvoiceGenerationJob(deps.invoiceUseCases, {
    lease: {
      workerId: runtimeConfig.workerId,
      leaseToken: randomUUID(),
      leaseSeconds: runtimeConfig.leaseSeconds,
    },
    heartbeatSeconds: runtimeConfig.heartbeatSeconds,
  });

  let cycleResult: RunInvoiceWorkerOnceResult;

  if (result.status === "no_job") {
    cycleResult = { status: "idle" };
  } else if (result.status === "retry_scheduled" || result.status === "failed") {
    cycleResult = { status: "failed", jobId: result.jobId };
  } else {
    cycleResult = { status: "processed", jobId: result.jobId };
  }

  const snapshot = resolveSnapshot(deps);

  emitStructuredLog({
    type: "invoice_worker_cycle",
    payload: {
      status: cycleResult.status,
      ...(cycleResult.jobId !== undefined ? { jobId: cycleResult.jobId } : {}),
      durationMs: Date.now() - startedAt,
      queueDepth: snapshot.queueDepth,
      processingCount: snapshot.processingCount,
      completedCount: snapshot.completedCount,
      retryScheduledCount: snapshot.retryScheduledCount,
      deadLetterCount: snapshot.deadLetterCount,
      terminalFailureRate: snapshot.terminalFailureRate,
    },
  });

  return cycleResult;
}
