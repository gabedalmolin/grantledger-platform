import { buildDeterministicCycleKey } from "@grantledger/domain";

import { notifyObserver, observerOf } from "./observer.js";
import { resolveId, resolveNow, stripLeaseMetadata } from "./job-utils.js";
import {
  InvoiceGenerationJobNotFoundError,
  InvoiceJobReplayNotAllowedError,
  type InvoiceGenerationJob,
  type InvoiceUseCaseDeps,
  type ReplayInvoiceGenerationJobInput,
  type ReplayInvoiceGenerationJobResult,
} from "./types.js";

export async function replayInvoiceGenerationJob(
  deps: InvoiceUseCaseDeps,
  input: ReplayInvoiceGenerationJobInput,
): Promise<ReplayInvoiceGenerationJobResult> {
  const sourceJob = await deps.invoiceJobStore.get(input.jobId);

  if (!sourceJob) {
    throw new InvoiceGenerationJobNotFoundError();
  }

  if (sourceJob.status !== "failed") {
    throw new InvoiceJobReplayNotAllowedError();
  }

  const cycleKey =
    sourceJob.cycleKey && sourceJob.cycleKey.length > 0
      ? sourceJob.cycleKey
      : buildDeterministicCycleKey(sourceJob.input);

  const existingInvoice = await deps.invoiceRepository.findByCycleKey(cycleKey);

  if (existingInvoice) {
    return {
      status: "skipped_already_completed",
      jobId: sourceJob.id,
      invoiceId: existingInvoice.id,
    };
  }

  const nowIso = resolveNow(deps);
  const replayReason =
    input.reason?.trim() && input.reason.trim().length > 0
      ? input.reason.trim()
      : "manual replay";

  const {
    reason: _sourceReason,
    lastError: _sourceLastError,
    deadLetteredAt: _sourceDeadLetteredAt,
    ...replayBase
  } = stripLeaseMetadata(sourceJob);
  void _sourceReason;
  void _sourceLastError;
  void _sourceDeadLetteredAt;

  const replayJob: InvoiceGenerationJob = {
    ...replayBase,
    id: resolveId(deps),
    status: "queued",
    cycleKey,
    createdAt: nowIso,
    updatedAt: nowIso,
    attemptCount: 0,
    nextAttemptAt: nowIso,
    replayOfJobId: sourceJob.id,
    replayReason,
  };

  await deps.invoiceJobStore.enqueue(replayJob);

  const observer = observerOf(deps);
  await notifyObserver("job_enqueued", () =>
    observer.onJobEnqueued?.(replayJob),
  );

  await deps.invoiceAuditLogger.log({
    action: "invoice.reissue",
    tenantId: replayJob.input.tenantId,
    subscriptionId: replayJob.input.subscriptionId,
    invoiceId: sourceJob.invoiceId ?? "n/a",
    traceId: replayJob.input.traceId,
    occurredAt: nowIso,
    metadata: {
      sourceJobId: sourceJob.id,
      replayJobId: replayJob.id,
      replayReason,
      cycleKey,
      calculationVersion: replayJob.input.calculationVersion,
    },
  });

  return {
    status: "replayed",
    jobId: replayJob.id,
    replayOfJobId: sourceJob.id,
  };
}
