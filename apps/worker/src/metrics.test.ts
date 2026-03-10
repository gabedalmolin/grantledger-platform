import { describe, expect, it } from "vitest";
import type { InvoiceOpsSnapshot } from "@grantledger/application";

import {
  createWorkerMetrics,
  recordWorkerCycleMetric,
} from "./metrics.js";

describe("recordWorkerCycleMetric", () => {
  it("records worker cycle counters, duration, and invoice gauges", async () => {
    const metrics = createWorkerMetrics({
      NODE_ENV: "test",
      GRANTLEDGER_VERSION: "1.0.0",
    });

    const snapshot: InvoiceOpsSnapshot = {
      queueDepth: 3,
      processingCount: 1,
      completedCount: 4,
      retryScheduledCount: 2,
      deadLetterCount: 1,
      terminalFailureRate: 0.25,
    };

    recordWorkerCycleMetric(metrics, {
      result: { status: "failed", jobId: "job_1" },
      durationSeconds: 0.125,
      snapshot,
    });

    const body = await metrics.registry.metrics();

    expect(body).toContain("grantledger_worker_cycles_total");
    expect(body).toContain('status="failed"');
    expect(body).toContain("grantledger_worker_failures_total");
    expect(body).toContain("grantledger_invoice_queue_depth");
    expect(body).toContain('service="worker"');
    expect(body).toContain('environment="test"');
    expect(body).toContain('version="1.0.0"');
  });
});
