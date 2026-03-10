import { afterEach, describe, expect, it, vi } from "vitest";

import {
  configureStructuredLogging,
  emitStructuredLog,
  resetStructuredLoggingForTests,
  resolveServiceObservabilityContext,
} from "./observability.js";

describe("resolveServiceObservabilityContext", () => {
  it("uses stable defaults and trims the version when present", () => {
    expect(
      resolveServiceObservabilityContext("api", {
        NODE_ENV: "production",
        GRANTLEDGER_VERSION: " 1.2.3 ",
      }),
    ).toEqual({
      service: "api",
      runtime: "nodejs",
      environment: "production",
      version: "1.2.3",
    });
  });
});

describe("emitStructuredLog", () => {
  afterEach(() => {
    resetStructuredLoggingForTests();
    vi.restoreAllMocks();
  });

  it("includes configured service metadata in emitted logs", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    configureStructuredLogging({
      service: "api",
      runtime: "nodejs",
      environment: "test",
      version: "1.2.3",
    });

    emitStructuredLog({
      type: "runtime_started",
      payload: { detail: "ok" },
    });

    const line = String(logSpy.mock.calls.at(-1)?.[0] ?? "{}");
    const parsed = JSON.parse(line) as Record<string, unknown>;

    expect(parsed).toMatchObject({
      type: "runtime_started",
      service: "api",
      runtime: "nodejs",
      environment: "test",
      version: "1.2.3",
      detail: "ok",
    });
  });
});
