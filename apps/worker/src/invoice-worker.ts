import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
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

const DEFAULT_LEASE_SECONDS = 30;
const DEFAULT_HEARTBEAT_SECONDS = 10;
const defaultWorkerId = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;

const EMPTY_SNAPSHOT: InvoiceOpsSnapshot = {
  queueDepth: 0,
  processingCount: 0,
  completedCount: 0,
  retryScheduledCount: 0,
  deadLetterCount: 0,
  terminalFailureRate: 0,
};

function parsePositiveInt(
  raw: string | undefined,
  envName: string,
  fallback: number,
): number {
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${envName} must be a positive integer`);
  }

  return value;
}

export function resolveInvoiceWorkerRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): InvoiceWorkerRuntimeConfig {
  const workerId = env.WORKER_ID?.trim() || defaultWorkerId;
  const leaseSeconds = parsePositiveInt(
    env.JOB_LEASE_SECONDS,
    "JOB_LEASE_SECONDS",
    DEFAULT_LEASE_SECONDS,
  );
  const heartbeatSeconds = parsePositiveInt(
    env.JOB_HEARTBEAT_SECONDS,
    "JOB_HEARTBEAT_SECONDS",
    DEFAULT_HEARTBEAT_SECONDS,
  );

  if (heartbeatSeconds >= leaseSeconds) {
    throw new Error("JOB_HEARTBEAT_SECONDS must be lower than JOB_LEASE_SECONDS");
  }

  return { workerId, leaseSeconds, heartbeatSeconds };
}

function resolveWorkerTenantId(): string {
  const value = process.env.WORKER_TENANT_ID?.trim();
  if (!value) {
    throw new Error(
      "WORKER_TENANT_ID is required when PERSISTENCE_DRIVER=postgres",
    );
  }
  return value;
}

export function createDefaultWorkerDeps(): InvoiceWorkerRuntimeDeps {
  const opsMonitor = createInMemoryInvoiceOpsMonitor();

  if (process.env.PERSISTENCE_DRIVER !== "postgres") {
    return {
      invoiceUseCases: {
        ...getSharedInvoiceUseCaseDeps(),
        jobObserver: opsMonitor.observer,
      },
      opsMonitor,
    };
  }

  const pool = createPostgresPool();
  const tenantId = resolveWorkerTenantId();

  return {
    invoiceUseCases: {
      ...createPostgresInvoiceUseCaseDeps(pool, tenantId),
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
