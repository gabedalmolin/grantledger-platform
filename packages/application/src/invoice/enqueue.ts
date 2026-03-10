import type {
  EnqueueInvoiceGenerationPayload,
  EnqueueInvoiceGenerationResponse,
} from "@grantledger/contracts";
import { buildDeterministicCycleKey } from "@grantledger/domain";

import { executeIdempotent } from "../idempotency.js";
import { buildEnqueueFingerprint, resolveId, resolveNow } from "./job-utils.js";
import { notifyObserver, observerOf } from "./observer.js";
import {
  DEFAULT_MAX_ATTEMPTS,
  type EnqueueInvoiceGenerationInput,
  type EnqueueInvoiceGenerationResult,
  type InvoiceGenerationJob,
  type InvoiceUseCaseDeps,
} from "./types.js";

export async function enqueueInvoiceGeneration(
  deps: InvoiceUseCaseDeps,
  input: EnqueueInvoiceGenerationInput,
): Promise<EnqueueInvoiceGenerationResult> {
  const observer = observerOf(deps);

  const { response, replayed } = await executeIdempotent<
    EnqueueInvoiceGenerationPayload,
    EnqueueInvoiceGenerationResponse
  >({
    scope: "invoice.enqueue",
    key: input.idempotencyKey,
    payload: input.payload,
    fingerprint: buildEnqueueFingerprint,
    store: deps.enqueueIdempotencyStore,
    ...(deps.now !== undefined ? { now: deps.now } : {}),
    execute: async () => {
      const createdAt = resolveNow(deps);
      const cycleKey = buildDeterministicCycleKey(input.payload);
      const jobId = resolveId(deps);
      const job: InvoiceGenerationJob = {
        id: jobId,
        status: "queued",
        cycleKey,
        input: input.payload,
        createdAt,
        updatedAt: createdAt,
        attemptCount: 0,
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
        nextAttemptAt: createdAt,
      };

      await deps.invoiceJobStore.enqueue(job);
      await notifyObserver("job_enqueued", () => observer.onJobEnqueued?.(job));

      return {
        jobId,
        status: "queued" as const,
      };
    },
  });

  return {
    ...response,
    replayed,
  };
}
