import { describe, expect, it } from "vitest";

import { DEFAULT_DEMO_DATABASE_URL, DEFAULT_DEMO_SCENARIO } from "./demo-seed.ts";
import { resolveDemoRuntimeConfig } from "./demo-self-hosted.ts";

describe("resolveDemoRuntimeConfig", () => {
  it("uses the documented self-hosted defaults", () => {
    const config = resolveDemoRuntimeConfig({});

    expect(config.apiBaseUrl).toBe("http://127.0.0.1:13000");
    expect(config.workerMetricsUrl).toBe("http://127.0.0.1:19464");
    expect(config.prometheusUrl).toBe("http://127.0.0.1:19090");
    expect(config.grafanaUrl).toBe("http://127.0.0.1:13001");
    expect(config.databaseUrl).toBe(DEFAULT_DEMO_DATABASE_URL);
    expect(config.requestTimeoutMs).toBe(10_000);
    expect(config.pollIntervalMs).toBe(1_000);
    expect(config.maxPollAttempts).toBe(30);
    expect(config.scenario).toEqual(DEFAULT_DEMO_SCENARIO);
  });

  it("prefers explicit demo env overrides", () => {
    const config = resolveDemoRuntimeConfig({
      DEMO_API_BASE_URL: "http://demo-api",
      DEMO_WORKER_METRICS_URL: "http://demo-worker",
      DEMO_PROMETHEUS_URL: "http://demo-prometheus",
      DEMO_GRAFANA_URL: "http://demo-grafana",
      DEMO_DATABASE_URL: "postgresql://demo-db",
      DEMO_REQUEST_TIMEOUT_MS: "5000",
      DEMO_POLL_INTERVAL_MS: "250",
      DEMO_MAX_POLL_ATTEMPTS: "12",
    });

    expect(config.apiBaseUrl).toBe("http://demo-api");
    expect(config.workerMetricsUrl).toBe("http://demo-worker");
    expect(config.prometheusUrl).toBe("http://demo-prometheus");
    expect(config.grafanaUrl).toBe("http://demo-grafana");
    expect(config.databaseUrl).toBe("postgresql://demo-db");
    expect(config.requestTimeoutMs).toBe(5000);
    expect(config.pollIntervalMs).toBe(250);
    expect(config.maxPollAttempts).toBe(12);
  });

  it("falls back to DATABASE_URL when DEMO_DATABASE_URL is not provided", () => {
    const config = resolveDemoRuntimeConfig({
      DATABASE_URL: "postgresql://shared-db",
    });

    expect(config.databaseUrl).toBe("postgresql://shared-db");
  });
});
