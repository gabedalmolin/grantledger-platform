import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetApiMetricsForTests } from "./metrics.js";
import { createApiRequestListener } from "./server.js";

async function withServer(
  listener: ReturnType<typeof createApiRequestListener>,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer(listener);

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

function createStubListener(overrides: Partial<Parameters<typeof createApiRequestListener>[0]> = {}) {
  return createApiRequestListener({
    handleCreateSubscription: vi.fn(async () => ({ status: 201, body: { ok: true } })),
    handleStartCheckout: vi.fn(async () => ({ status: 201, body: { ok: true } })),
    handleEnqueueInvoiceGeneration: vi.fn(async () => ({ status: 202, body: { ok: true } })),
    handleGetInvoiceGenerationJobStatus: vi.fn(async () => ({ status: 200, body: { ok: true } })),
    handleProviderWebhook: vi.fn(async () => ({ status: 200, body: { ok: true } })),
    ...overrides,
  });
}

describe("createApiRequestListener", () => {
  afterEach(() => {
    resetApiMetricsForTests();
    vi.restoreAllMocks();
  });

  it("returns health information on /healthz", async () => {
    const listener = createStubListener();

    await withServer(listener, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/healthz`);

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      await expect(response.json()).resolves.toEqual({ status: "ok" });
    });
  });

  it("returns readiness failure on /readyz when the readiness check throws", async () => {
    const listener = createStubListener({
      readinessCheck: vi.fn(async () => {
        throw new Error("Database unavailable");
      }),
    });

    await withServer(listener, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/readyz`);

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        status: "not_ready",
        message: "Database unavailable",
      });
    });
  });

  it("routes API requests to the matching handler with normalised headers and parsed JSON", async () => {
    const handleStartCheckout = vi.fn(async () => ({
      status: 201,
      body: { ok: true },
    }));

    const listener = createStubListener({ handleStartCheckout });

    await withServer(listener, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/checkout/sessions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "u_1",
          "x-tenant-id": "t_1",
          "x-trace-id": "trace_1",
        },
        body: JSON.stringify({
          planId: "plan_basic",
          billingPeriod: "monthly",
        }),
      });

      expect(response.status).toBe(201);
      expect(handleStartCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          "content-type": "application/json",
          "x-user-id": "u_1",
          "x-tenant-id": "t_1",
          "x-trace-id": "trace_1",
        }),
        {
          planId: "plan_basic",
          billingPeriod: "monthly",
        },
      );
    });
  });

  it("returns a standard bad request response when the JSON body is invalid", async () => {
    const listener = createStubListener();

    await withServer(listener, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/checkout/sessions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-trace-id": "trace_invalid_json",
        },
        body: "{invalid-json",
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        message: "Invalid JSON body",
        code: "BAD_REQUEST",
        traceId: "trace_invalid_json",
      });
    });
  });

  it("rejects oversized JSON request bodies deterministically", async () => {
    const handleStartCheckout = vi.fn(async () => ({
      status: 201,
      body: { ok: true },
    }));

    const listener = createStubListener({
      handleStartCheckout,
      jsonBodyLimitBytes: 16,
    });

    await withServer(listener, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/checkout/sessions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-trace-id": "trace_too_large",
        },
        body: JSON.stringify({
          planId: "plan_basic",
          billingPeriod: "monthly",
        }),
      });

      expect(response.status).toBe(413);
      expect(handleStartCheckout).not.toHaveBeenCalled();
      await expect(response.json()).resolves.toMatchObject({
        message: "Request body exceeds configured limit",
        code: "PAYLOAD_TOO_LARGE",
        traceId: "trace_too_large",
      });
    });
  });

  it("exposes scrapeable metrics for the API runtime", async () => {
    const listener = createStubListener();

    await withServer(listener, async (baseUrl) => {
      await fetch(`${baseUrl}/healthz`);

      const response = await fetch(`${baseUrl}/metrics`);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/plain");
      expect(body).toContain("grantledger_api_http_requests_total");
      expect(body).toContain("grantledger_api_http_request_duration_seconds");
      expect(body).toContain("grantledger_api_health_state");
      expect(body).toContain('route="/healthz"');
    });
  });
});
