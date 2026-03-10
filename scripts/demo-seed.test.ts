import { describe, expect, it } from "vitest";

import {
  DEFAULT_DEMO_DATABASE_URL,
  DEFAULT_DEMO_SCENARIO,
  resolveDemoSeedConfig,
} from "./demo-seed.ts";

describe("resolveDemoSeedConfig", () => {
  it("uses the explicit demo database url when provided", () => {
    const config = resolveDemoSeedConfig({
      DEMO_DATABASE_URL: "postgresql://demo-override",
    });

    expect(config.databaseUrl).toBe("postgresql://demo-override");
    expect(config.scenario).toEqual(DEFAULT_DEMO_SCENARIO);
  });

  it("falls back to DATABASE_URL before the default demo database url", () => {
    const config = resolveDemoSeedConfig({
      DATABASE_URL: "postgresql://database-url",
    });

    expect(config.databaseUrl).toBe("postgresql://database-url");
  });

  it("uses the default self-hosted demo database url when no env is present", () => {
    const config = resolveDemoSeedConfig({});

    expect(config.databaseUrl).toBe(DEFAULT_DEMO_DATABASE_URL);
  });
});
