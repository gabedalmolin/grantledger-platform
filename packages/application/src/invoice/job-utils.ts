import { randomUUID } from "node:crypto";
import type { EnqueueInvoiceGenerationPayload } from "@grantledger/contracts";
import { buildDeterministicCycleKey } from "@grantledger/domain";
import { addSecondsToIso, hashPayload, utcNowIso } from "@grantledger/shared";

import {
  InvoiceGenerationJobNotFoundError,
  type InvoiceGenerationJob,
  type InvoiceUseCaseDeps,
} from "./types.js";

export function resolveNow(deps: Pick<InvoiceUseCaseDeps, "now">): string {
  return (deps.now ?? utcNowIso)();
}

export function resolveId(deps: Pick<InvoiceUseCaseDeps, "generateId">): string {
  return (deps.generateId ?? randomUUID)();
}

export function computeRetryDelaySeconds(attemptCount: number): number {
  return Math.min(2 ** attemptCount, 60);
}

export function computeNextAttemptAt(
  nowIso: string,
  delaySeconds: number,
): string {
  return addSecondsToIso(nowIso, delaySeconds);
}

export function buildEnqueueFingerprint(
  payload: EnqueueInvoiceGenerationPayload | undefined,
): string {
  if (!payload) {
    return hashPayload(null);
  }

  const cycleKey = buildDeterministicCycleKey(payload);
  const { traceId: _traceId, ...stableInput } = payload;
  void _traceId;

  const inputHash = hashPayload(stableInput);
  return hashPayload({ cycleKey, inputHash });
}

export function cloneJob(job: InvoiceGenerationJob): InvoiceGenerationJob {
  return {
    ...job,
    input: { ...job.input },
  };
}

export function stripLeaseMetadata(job: InvoiceGenerationJob): InvoiceGenerationJob {
  const {
    leaseOwner: _leaseOwner,
    leaseToken: _leaseToken,
    leaseExpiresAt: _leaseExpiresAt,
    ...withoutLease
  } = job;

  void _leaseOwner;
  void _leaseToken;
  void _leaseExpiresAt;
  return withoutLease;
}

export function requireJob(
  store: Map<string, InvoiceGenerationJob>,
  jobId: string,
): InvoiceGenerationJob {
  const job = store.get(jobId);
  if (!job) {
    throw new InvoiceGenerationJobNotFoundError();
  }
  return job;
}
