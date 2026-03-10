import { pathToFileURL } from "node:url";
import { emitStructuredLog } from "@grantledger/shared";

import {
  createDefaultWorkerDeps,
  runInvoiceWorkerOnce,
  type InvoiceWorkerRuntimeDeps,
  type RunInvoiceWorkerOnceResult,
} from "./invoice-worker.js";

const DEFAULT_WORKER_POLL_INTERVAL_MS = 1000;

export interface InvoiceWorkerProcessConfig {
  pollIntervalMs: number;
}

export interface RunInvoiceWorkerProcessInput {
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  deps?: InvoiceWorkerRuntimeDeps;
  runCycle?: () => Promise<RunInvoiceWorkerOnceResult>;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

function parsePositiveInt(raw: string | undefined, envName: string, fallback: number): number {
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${envName} must be a positive integer`);
  }

  return value;
}

export function resolveInvoiceWorkerProcessConfig(
  env: NodeJS.ProcessEnv = process.env,
): InvoiceWorkerProcessConfig {
  return {
    pollIntervalMs: parsePositiveInt(
      env.WORKER_POLL_INTERVAL_MS,
      "WORKER_POLL_INTERVAL_MS",
      DEFAULT_WORKER_POLL_INTERVAL_MS,
    ),
  };
}

async function sleepWithSignal(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);

    const onAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function runInvoiceWorkerProcess(
  input: RunInvoiceWorkerProcessInput = {},
): Promise<void> {
  const env = input.env ?? process.env;
  const config = resolveInvoiceWorkerProcessConfig(env);
  const deps = input.deps;
  const runCycle = input.runCycle ?? (() => runInvoiceWorkerOnce(deps));
  const sleep = input.sleep ?? sleepWithSignal;

  while (!input.signal?.aborted) {
    await runCycle();

    if (input.signal?.aborted) {
      break;
    }

    await sleep(config.pollIntervalMs, input.signal);
  }
}

function isMainModule(moduleUrl: string): boolean {
  const entry = process.argv[1];
  return entry ? pathToFileURL(entry).href === moduleUrl : false;
}

async function runWorkerAsMain(): Promise<void> {
  const deps = createDefaultWorkerDeps();
  const controller = new AbortController();
  const config = resolveInvoiceWorkerProcessConfig();
  let stopping = false;
  let closed = false;

  const closeDeps = async (): Promise<void> => {
    if (closed) {
      return;
    }

    closed = true;
    await deps.close?.();
  };

  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) {
      return;
    }

    stopping = true;
    controller.abort();
    emitStructuredLog({
      type: "invoice_worker_process_stopping",
      payload: { signal },
    });
    await closeDeps();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  emitStructuredLog({
    type: "invoice_worker_process_started",
    payload: {
      pollIntervalMs: config.pollIntervalMs,
    },
  });

  try {
    await runInvoiceWorkerProcess({
      deps,
      signal: controller.signal,
    });
  } finally {
    await closeDeps();
  }
}

if (isMainModule(import.meta.url)) {
  void runWorkerAsMain().catch((error) => {
    emitStructuredLog({
      level: "error",
      type: "invoice_worker_process_failed",
      payload: {
        message: error instanceof Error ? error.message : "Unknown worker error",
      },
    });
    process.exitCode = 1;
  });
}
