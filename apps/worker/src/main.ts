import { pathToFileURL } from "node:url";
import { emitStructuredLog } from "@grantledger/shared";

import {
  createDefaultWorkerDeps,
  runInvoiceWorkerOnce,
  type InvoiceWorkerRuntimeDeps,
  type RunInvoiceWorkerOnceResult,
} from "./invoice-worker.js";
import { resolveWorkerRuntimeConfig } from "./runtime-config.js";

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

export function resolveInvoiceWorkerProcessConfig(
  env: NodeJS.ProcessEnv = process.env,
): InvoiceWorkerProcessConfig {
  const config = resolveWorkerRuntimeConfig(env);

  return {
    pollIntervalMs: config.pollIntervalMs,
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
  const config = resolveWorkerRuntimeConfig(env);
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
  const config = resolveWorkerRuntimeConfig();
  const deps = createDefaultWorkerDeps(config);
  const controller = new AbortController();
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
      persistenceDriver: config.persistenceDriver,
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
