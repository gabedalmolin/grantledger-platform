import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BadRequestError } from "@grantledger/application";
import { parseOrThrowBadRequest } from "./validation.js";

describe("parseOrThrowBadRequest", () => {
  const schema = z.object({
    planId: z.string().min(1),
    quantity: z.number().int().positive(),
  });

  it("returns parsed payload when valid", () => {
    const parsed = parseOrThrowBadRequest(schema, {
      planId: "plan_basic",
      quantity: 2,
    });

    expect(parsed).toEqual({
      planId: "plan_basic",
      quantity: 2,
    });
  });

  it("throws BadRequestError with structured validation details", () => {
    const execute = () =>
      parseOrThrowBadRequest(schema, { planId: "", quantity: 0 }, "Invalid");

    expect(execute).toThrow(BadRequestError);

    try {
      execute();
      throw new Error("Expected parseOrThrowBadRequest to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestError);
      const badRequestError = error as BadRequestError;
      expect(badRequestError.details).toMatchObject({
        type: "validation",
      });
      expect(
        (badRequestError.details as { issues: Array<{ path: string }> }).issues,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "planId" }),
          expect.objectContaining({ path: "quantity" }),
        ]),
      );
    }
  });
});
