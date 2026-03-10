import type { InvoiceOpsSnapshot } from "@grantledger/application";
import {
  createMetricsRegistry,
  resolveServiceObservabilityContext,
} from "@grantledger/shared";
import { Counter, Gauge, Histogram, type Registry } from "prom-client";

import type { RunInvoiceWorkerOnceResult } from "./invoice-worker.js";

export interface WorkerMetrics {
  registry: Registry;
  upState: Gauge;
  cycleCounter: Counter<"status">;
  cycleDuration: Histogram<"status">;
  failureCounter: Counter;
  queueDepth: Gauge;
  processingCount: Gauge;
  completedCount: Gauge;
  retryScheduledCount: Gauge;
  deadLetterCount: Gauge;
  terminalFailureRate: Gauge;
}

export interface RecordWorkerCycleMetricInput {
  result: RunInvoiceWorkerOnceResult;
  durationSeconds: number;
  snapshot: InvoiceOpsSnapshot;
}

let sharedWorkerMetrics: WorkerMetrics | undefined;

export function createWorkerMetrics(
  env: NodeJS.ProcessEnv = process.env,
): WorkerMetrics {
  const registry = createMetricsRegistry({
    context: resolveServiceObservabilityContext("worker", env),
  });

  const upState = new Gauge({
    name: "grantledger_worker_up",
    help: "Whether the worker runtime is up.",
    registers: [registry],
  });

  const cycleCounter = new Counter({
    name: "grantledger_worker_cycles_total",
    help: "Total worker cycles partitioned by result status.",
    labelNames: ["status"] as const,
    registers: [registry],
  });

  const cycleDuration = new Histogram({
    name: "grantledger_worker_cycle_duration_seconds",
    help: "Duration of worker cycles partitioned by result status.",
    labelNames: ["status"] as const,
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [registry],
  });

  const failureCounter = new Counter({
    name: "grantledger_worker_failures_total",
    help: "Total failed worker cycles.",
    registers: [registry],
  });

  const queueDepth = new Gauge({
    name: "grantledger_invoice_queue_depth",
    help: "Current invoice queue depth reported by the worker observer.",
    registers: [registry],
  });

  const processingCount = new Gauge({
    name: "grantledger_invoice_processing_count",
    help: "Current invoice processing count reported by the worker observer.",
    registers: [registry],
  });

  const completedCount = new Gauge({
    name: "grantledger_invoice_completed_count",
    help: "Completed invoice count reported by the worker observer.",
    registers: [registry],
  });

  const retryScheduledCount = new Gauge({
    name: "grantledger_invoice_retry_scheduled_count",
    help: "Retry scheduled invoice count reported by the worker observer.",
    registers: [registry],
  });

  const deadLetterCount = new Gauge({
    name: "grantledger_invoice_dead_letter_count",
    help: "Dead-letter invoice count reported by the worker observer.",
    registers: [registry],
  });

  const terminalFailureRate = new Gauge({
    name: "grantledger_invoice_terminal_failure_rate",
    help: "Terminal invoice failure rate reported by the worker observer.",
    registers: [registry],
  });

  upState.set(1);

  return {
    registry,
    upState,
    cycleCounter,
    cycleDuration,
    failureCounter,
    queueDepth,
    processingCount,
    completedCount,
    retryScheduledCount,
    deadLetterCount,
    terminalFailureRate,
  };
}

export function getWorkerMetrics(
  env: NodeJS.ProcessEnv = process.env,
): WorkerMetrics {
  if (!sharedWorkerMetrics) {
    sharedWorkerMetrics = createWorkerMetrics(env);
  }

  return sharedWorkerMetrics;
}

export function resetWorkerMetricsForTests(): void {
  sharedWorkerMetrics = undefined;
}

export function recordWorkerCycleMetric(
  metrics: WorkerMetrics,
  input: RecordWorkerCycleMetricInput,
): void {
  metrics.cycleCounter.inc({ status: input.result.status });
  metrics.cycleDuration.observe(
    { status: input.result.status },
    input.durationSeconds,
  );

  if (input.result.status === "failed") {
    metrics.failureCounter.inc();
  }

  metrics.queueDepth.set(input.snapshot.queueDepth);
  metrics.processingCount.set(input.snapshot.processingCount);
  metrics.completedCount.set(input.snapshot.completedCount);
  metrics.retryScheduledCount.set(input.snapshot.retryScheduledCount);
  metrics.deadLetterCount.set(input.snapshot.deadLetterCount);
  metrics.terminalFailureRate.set(input.snapshot.terminalFailureRate);
}
