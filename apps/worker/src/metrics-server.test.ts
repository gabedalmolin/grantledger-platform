import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";

import { createWorkerMetrics, resetWorkerMetricsForTests } from "./metrics.js";
import { startWorkerMetricsServer } from "./metrics-server.js";

describe("startWorkerMetricsServer", () => {
  afterEach(() => {
    resetWorkerMetricsForTests();
  });

  it("serves worker metrics on a dedicated HTTP server", async () => {
    const metrics = createWorkerMetrics({
      NODE_ENV: "test",
    });

    const started = await startWorkerMetricsServer({
      metrics,
      config: {
        host: "127.0.0.1",
        port: 0,
      },
    });

    const address = started.server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const healthResponse = await fetch(`${baseUrl}/healthz`);
      expect(healthResponse.status).toBe(200);

      const metricsResponse = await fetch(`${baseUrl}/metrics`);
      const body = await metricsResponse.text();

      expect(metricsResponse.status).toBe(200);
      expect(metricsResponse.headers.get("content-type")).toContain("text/plain");
      expect(body).toContain("grantledger_worker_cycles_total");
      expect(body).toContain("grantledger_worker_up");
    } finally {
      await started.close();
    }
  });
});
