import { describe, expect, it } from "vitest";

import {
  enqueueInvoiceGenerationPayloadSchema,
  getInvoiceGenerationJobStatusResponseSchema,
} from "./invoice-api.js";

describe("invoice API schemas", () => {
  it("rejects unexpected fields in enqueue invoice generation payload", () => {
    const result = enqueueInvoiceGenerationPayloadSchema.safeParse({
      tenantId: "tenant_1",
      subscriptionId: "sub_1",
      customerId: "customer_1",
      planId: "plan_basic",
      planVersionId: "plan_v1",
      priceAmountInCents: 1999,
      currency: "BRL",
      periodStart: "2026-03-01T00:00:00.000Z",
      periodEnd: "2026-03-31T23:59:59.000Z",
      calculationVersion: "calc_v1",
      traceId: "trace_1",
      unexpectedField: "should-fail",
    });

    expect(result.success).toBe(false);
  });

  it("accepts completed job status responses with optional terminal fields", () => {
    const result = getInvoiceGenerationJobStatusResponseSchema.parse({
      jobId: "job_1",
      status: "completed",
      invoiceId: "inv_1",
    });

    expect(result).toEqual({
      jobId: "job_1",
      status: "completed",
      invoiceId: "inv_1",
    });
  });
});
