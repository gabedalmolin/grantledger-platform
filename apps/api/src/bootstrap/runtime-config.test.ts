import { describe, expect, it } from "vitest";
import { resolveApiRuntimeConfig } from "./runtime-config.js";

describe("resolveApiRuntimeConfig", () => {
  it("defaults to memory when env is not set", () => {
    expect(resolveApiRuntimeConfig({})).toEqual({ persistenceDriver: "memory" });
  });

  it("accepts postgres when DATABASE_URL is present", () => {
    expect(
      resolveApiRuntimeConfig({
        PERSISTENCE_DRIVER: "postgres",
        DATABASE_URL: "postgresql://localhost:5432/grantledger",
      }),
    ).toEqual({ persistenceDriver: "postgres" });
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
});
