import { describe, expect, it } from "vitest";
import { buildStandardErrorBody } from "./index.js";

describe("shared error helpers", () => {
  it("builds envelope with required fields", () => {
    const body = buildStandardErrorBody({
      message: "Invalid request",
      code: "BAD_REQUEST",
    });

    expect(body).toEqual({
      message: "Invalid request",
      code: "BAD_REQUEST",
    });
  });

  it("adds optional fields when present", () => {
    const body = buildStandardErrorBody({
      message: "Conflict",
      code: "CONFLICT",
      messageKey: "error.conflict",
      messageParams: { resource: "subscription" },
      details: { field: "idempotency-key" },
      traceId: "trace-1",
    });

    expect(body).toEqual({
      message: "Conflict",
      code: "CONFLICT",
      messageKey: "error.conflict",
      messageParams: { resource: "subscription" },
      details: { field: "idempotency-key" },
      traceId: "trace-1",
    });
  });
});
