import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

export type PersistenceDriver = "memory" | "postgres";

const DEFAULT_WORKER_POLL_INTERVAL_MS = 1000;
const DEFAULT_LEASE_SECONDS = 30;
const DEFAULT_HEARTBEAT_SECONDS = 10;
const DEFAULT_WORKER_ID = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;

export interface WorkerRuntimeConfig {
  persistenceDriver: PersistenceDriver;
  databaseUrl?: string;
  workerTenantId?: string;
  pollIntervalMs: number;
  workerId: string;
  leaseSeconds: number;
  heartbeatSeconds: number;
}

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

export function resolveWorkerRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): WorkerRuntimeConfig {
  const rawDriver = env.PERSISTENCE_DRIVER?.trim();

  if (rawDriver && rawDriver !== "memory" && rawDriver !== "postgres") {
    throw new Error("PERSISTENCE_DRIVER must be either 'memory' or 'postgres'");
  }

  const persistenceDriver: PersistenceDriver =
    rawDriver === "postgres" ? "postgres" : "memory";
  const databaseUrl = env.DATABASE_URL?.trim() || undefined;
  const workerTenantId = env.WORKER_TENANT_ID?.trim() || undefined;
  const pollIntervalMs = parsePositiveInt(
    env.WORKER_POLL_INTERVAL_MS,
    "WORKER_POLL_INTERVAL_MS",
    DEFAULT_WORKER_POLL_INTERVAL_MS,
  );
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

  if (persistenceDriver === "postgres") {
    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL is required when PERSISTENCE_DRIVER=postgres",
      );
    }

    if (!workerTenantId) {
      throw new Error(
        "WORKER_TENANT_ID is required when PERSISTENCE_DRIVER=postgres",
      );
    }
  }

  return {
    persistenceDriver,
    ...(databaseUrl ? { databaseUrl } : {}),
    ...(workerTenantId ? { workerTenantId } : {}),
    pollIntervalMs,
    workerId: env.WORKER_ID?.trim() || DEFAULT_WORKER_ID,
    leaseSeconds,
    heartbeatSeconds,
  };
}
