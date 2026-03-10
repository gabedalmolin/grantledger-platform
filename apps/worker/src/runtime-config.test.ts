import { describe, expect, it } from "vitest";

import { resolveWorkerRuntimeConfig } from "./runtime-config.js";

describe("resolveWorkerRuntimeConfig", () => {
  it("defaults to memory mode with worker runtime defaults", () => {
    const config = resolveWorkerRuntimeConfig({});

    expect(config).toMatchObject({
      persistenceDriver: "memory",
      pollIntervalMs: 1000,
      leaseSeconds: 30,
      heartbeatSeconds: 10,
    });
    expect(config.workerId.length).toBeGreaterThan(0);
  });

  it("throws when postgres mode is selected without DATABASE_URL", () => {
    expect(() =>
      resolveWorkerRuntimeConfig({
        PERSISTENCE_DRIVER: "postgres",
        WORKER_TENANT_ID: "tenant_demo",
      }),
    ).toThrow("DATABASE_URL is required when PERSISTENCE_DRIVER=postgres");
  });

  it("throws when postgres mode is selected without WORKER_TENANT_ID", () => {
    expect(() =>
      resolveWorkerRuntimeConfig({
        PERSISTENCE_DRIVER: "postgres",
        DATABASE_URL: "postgresql://localhost:5432/grantledger",
      }),
    ).toThrow("WORKER_TENANT_ID is required when PERSISTENCE_DRIVER=postgres");
  });

  it("throws when the worker poll interval is invalid", () => {
    expect(() =>
      resolveWorkerRuntimeConfig({
        WORKER_POLL_INTERVAL_MS: "0",
      }),
    ).toThrow("WORKER_POLL_INTERVAL_MS must be a positive integer");
  });

  it("throws when heartbeat is greater than or equal to lease", () => {
    expect(() =>
      resolveWorkerRuntimeConfig({
        JOB_LEASE_SECONDS: "10",
        JOB_HEARTBEAT_SECONDS: "10",
      }),
    ).toThrow("JOB_HEARTBEAT_SECONDS must be lower than JOB_LEASE_SECONDS");
  });
});
