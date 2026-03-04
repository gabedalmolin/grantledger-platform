import { describe, expect, it } from "vitest";
import { createApiCompositionRoot } from "../bootstrap/composition-root.js";
import type { Headers } from "../http/types.js";

const { handleStartCheckout } = createApiCompositionRoot();

function asHeaders(value: Record<string, string>): Headers {
  return value as unknown as Headers;
}

describe("checkout handler integration", () => {
  it("returns 403 when membership is missing", async () => {
    const response = await handleStartCheckout(
      asHeaders({
        "x-user-id": "user-1",
        "x-tenant-id": "tenant-1",
      }),
      {} as unknown as Parameters<typeof handleStartCheckout>[1],
    );

    expect(response.status).toBe(403);
  });

  it("returns 400 when payload is invalid for authorized membership", async () => {
    const response = await handleStartCheckout(
      asHeaders({
        "x-user-id": "u_1",
        "x-tenant-id": "t_1",
      }),
      {} as unknown as Parameters<typeof handleStartCheckout>[1],
    );

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "BAD_REQUEST",
      messageKey: "error.bad_request",
      details: { type: "validation" },
    });

    const issues = (
      response.body as { details?: { issues?: Array<{ path: string }> } }
    ).details?.issues;

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "planId" }),
        expect.objectContaining({ path: "billingPeriod" }),
      ]),
    );
  });

  it("returns 201 when payload is valid for authorized membership", async () => {
    const response = await handleStartCheckout(
      asHeaders({
        "x-user-id": "u_1",
        "x-tenant-id": "t_1",
      }),
      {
        planId: "plan_basic",
        billingPeriod: "monthly",
      } as Parameters<typeof handleStartCheckout>[1],
    );

    expect(response.status).toBe(201);
  });
});
