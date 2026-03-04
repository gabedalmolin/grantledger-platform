import { describe, expect, it } from "vitest";
import { AppError, BadRequestError } from "@grantledger/application";
import { SubscriptionDomainError } from "@grantledger/domain";
import { toApiErrorResponse } from "./errors.js";

describe("toApiErrorResponse", () => {
  it("maps AppError using status/code/message", () => {
    const error = new BadRequestError("Invalid payload");
    const response = toApiErrorResponse(error);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      message: "Invalid payload",
      code: "BAD_REQUEST",
      messageKey: "error.bad_request",
    });
  });

  it("maps SubscriptionDomainError to 409 DOMAIN_CONFLICT", () => {
    const error = new SubscriptionDomainError("Invalid transition");
    const response = toApiErrorResponse(error);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      message: "Invalid transition",
      code: "DOMAIN_CONFLICT",
      messageKey: "error.domain_conflict",
    });
  });

  it("maps unknown error to 500 INTERNAL_ERROR with i18n fallback", () => {
    const response = toApiErrorResponse(new Error("boom"), undefined, "en-US");

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      message: "Unexpected error",
      code: "INTERNAL_ERROR",
      messageKey: "error.unexpected",
    });
  });

  it("attaches traceId when provided", () => {
    const response = toApiErrorResponse(
      new BadRequestError("Invalid payload"),
      "trace-123",
    );

    expect(response.body).toMatchObject({
      traceId: "trace-123",
    });
  });

  it("preserves messageKey and messageParams when provided by AppError", () => {
    const error = new AppError({
      message: "Conflict with context",
      code: "CONFLICT",
      httpStatus: 409,
      messageKey: "error.conflict",
      messageParams: { resource: "subscription", operation: "upgrade" },
    });

    const response = toApiErrorResponse(error);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      message: "Conflict with context",
      code: "CONFLICT",
      messageKey: "error.conflict",
      messageParams: { resource: "subscription", operation: "upgrade" },
    });
  });
});
