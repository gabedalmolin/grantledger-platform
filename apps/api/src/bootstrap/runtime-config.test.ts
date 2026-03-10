import { describe, expect, it } from "vitest";
import { resolveApiRuntimeConfig } from "./runtime-config.js";

describe("resolveApiRuntimeConfig", () => {
  it("defaults to memory when env is not set", () => {
    expect(resolveApiRuntimeConfig({})).toEqual({
      persistenceDriver: "memory",
      host: "0.0.0.0",
      port: 3000,
      jsonBodyLimitBytes: 1024 * 1024,
    });
  });

  it("accepts postgres when DATABASE_URL is present", () => {
    expect(
      resolveApiRuntimeConfig({
        PERSISTENCE_DRIVER: "postgres",
        DATABASE_URL: "postgresql://localhost:5432/grantledger",
        STRIPE_WEBHOOK_SECRET: "  whsec_test  ",
      }),
    ).toEqual({
      persistenceDriver: "postgres",
      databaseUrl: "postgresql://localhost:5432/grantledger",
      host: "0.0.0.0",
      port: 3000,
      jsonBodyLimitBytes: 1024 * 1024,
      stripeWebhookSecret: "whsec_test",
    });
  });

  it("throws when postgres is selected without DATABASE_URL", () => {
    expect(() =>
      resolveApiRuntimeConfig({
        PERSISTENCE_DRIVER: "postgres",
      }),
    ).toThrow("DATABASE_URL is required when PERSISTENCE_DRIVER=postgres");
  });

  it("throws for unsupported persistence driver", () => {
    expect(() =>
      resolveApiRuntimeConfig({
        PERSISTENCE_DRIVER: "redis",
      }),
    ).toThrow("PERSISTENCE_DRIVER must be either 'memory' or 'postgres'");
  });

  it("throws for an invalid API port", () => {
    expect(() =>
      resolveApiRuntimeConfig({
        API_PORT: "70000",
      }),
    ).toThrow("API_PORT must be a valid TCP port number");
  });

  it("throws for an invalid body size limit", () => {
    expect(() =>
      resolveApiRuntimeConfig({
        API_JSON_BODY_LIMIT_BYTES: "0",
      }),
    ).toThrow("API_JSON_BODY_LIMIT_BYTES must be a positive integer");
  });
});
