import { describe, expect, it, vi } from "vitest";

import {
  resolveInvoiceWorkerProcessConfig,
  runInvoiceWorkerProcess,
} from "./main.js";

describe("resolveInvoiceWorkerProcessConfig", () => {
  it("defaults the worker poll interval when the env var is not set", () => {
    expect(resolveInvoiceWorkerProcessConfig({})).toEqual({
      pollIntervalMs: 1000,
    });
  });

  it("throws when the worker poll interval is invalid", () => {
    expect(() =>
      resolveInvoiceWorkerProcessConfig({
        WORKER_POLL_INTERVAL_MS: "0",
      }),
    ).toThrow("WORKER_POLL_INTERVAL_MS must be a positive integer");
  });
});

describe("runInvoiceWorkerProcess", () => {
  it("runs worker cycles until the signal is aborted", async () => {
    const controller = new AbortController();
    const runCycle = vi.fn(async () => ({ status: "idle" as const }));
    const sleep = vi.fn(async () => {
      controller.abort();
    });

    await runInvoiceWorkerProcess({
      env: {
        WORKER_POLL_INTERVAL_MS: "25",
      },
      signal: controller.signal,
      runCycle,
      sleep,
    });

    expect(runCycle).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(25, controller.signal);
  });
});
