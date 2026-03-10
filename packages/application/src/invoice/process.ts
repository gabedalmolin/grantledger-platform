import { executeIdempotent } from "../idempotency.js";
import { buildInvoice } from "./build.js";
import {
  computeNextAttemptAt,
  computeRetryDelaySeconds,
  resolveId,
  resolveNow,
} from "./job-utils.js";
import { notifyObserver, observerOf } from "./observer.js";
import {
  DEFAULT_LEASE_SECONDS,
  InvoiceJobLeaseError,
  type InvoiceJobLease,
  type InvoiceUseCaseDeps,
  type ProcessNextInvoiceGenerationJobInput,
  type ProcessNextInvoiceGenerationJobResult,
} from "./types.js";

export async function processNextInvoiceGenerationJob(
  deps: InvoiceUseCaseDeps,
  input?: ProcessNextInvoiceGenerationJobInput,
): Promise<ProcessNextInvoiceGenerationJobResult> {
  const lease = input?.lease ?? {
    workerId: "worker-default",
    leaseToken: resolveId(deps),
    leaseSeconds: DEFAULT_LEASE_SECONDS,
  };
  const heartbeatSeconds = input?.heartbeatSeconds;
  const leaseRef: InvoiceJobLease = {
    workerId: lease.workerId,
    leaseToken: lease.leaseToken,
  };

  const job = await deps.invoiceJobStore.claimNext(lease);
  const observer = observerOf(deps);

  if (!job) {
    return { status: "no_job" };
  }

  await notifyObserver("job_claimed", () => observer.onJobClaimed?.(job));
  let leaseRenewalError: Error | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  if (
    heartbeatSeconds !== undefined &&
    Number.isFinite(heartbeatSeconds) &&
    heartbeatSeconds > 0
  ) {
    heartbeatTimer = setInterval(() => {
      void deps.invoiceJobStore
        .renewLease(job.id, leaseRef, lease.leaseSeconds)
        .catch((error) => {
          if (leaseRenewalError !== null) {
            return;
          }

          leaseRenewalError =
            error instanceof Error
              ? error
              : new Error("Unexpected lease renewal failure");
        });
    }, heartbeatSeconds * 1000);
    heartbeatTimer.unref?.();
  }

  try {
    const { response } = await executeIdempotent({
      scope: "invoice.process",
      key: job.id,
      payload: {
        jobId: job.id,
        cycleKey: job.cycleKey,
        input: job.input,
      },
      store: deps.processIdempotencyStore,
      ...(deps.now !== undefined ? { now: deps.now } : {}),
      execute: async () => {
        const existingInvoice = await deps.invoiceRepository.findByCycleKey(
          job.cycleKey,
        );

        if (existingInvoice) {
          return { invoiceId: existingInvoice.id };
        }

        const invoice = buildInvoice(deps, job.input);
        await deps.invoiceRepository.save(invoice, job.cycleKey);
        await deps.invoiceAuditLogger.log({
          action: "invoice.generate",
          tenantId: invoice.tenantId,
          subscriptionId: invoice.subscriptionId,
          invoiceId: invoice.id,
          traceId: job.input.traceId,
          occurredAt: resolveNow(deps),
          metadata: {
            jobId: job.id,
            cycleKey: job.cycleKey,
            calculationVersion: job.input.calculationVersion,
          },
        });

        return { invoiceId: invoice.id };
      },
    });

    if (leaseRenewalError) {
      throw leaseRenewalError;
    }

    await deps.invoiceJobStore.markCompleted(job.id, response.invoiceId, leaseRef);
    await notifyObserver("job_completed", () =>
      observer.onJobCompleted?.(job, response.invoiceId),
    );

    return {
      status: "processed",
      jobId: job.id,
      invoiceId: response.invoiceId,
    };
  } catch (error) {
    if (error instanceof InvoiceJobLeaseError) {
      return {
        status: "failed",
        jobId: job.id,
        reason: error.message,
      };
    }

    const reason =
      error instanceof Error
        ? error.message
        : "Unexpected invoice processing failure";

    const nextAttempt = job.attemptCount + 1;

    if (nextAttempt < job.maxAttempts) {
      const nowIso = resolveNow(deps);
      const delaySeconds = computeRetryDelaySeconds(nextAttempt);
      const nextAttemptAt = computeNextAttemptAt(nowIso, delaySeconds);

      try {
        await deps.invoiceJobStore.markRetry(
          job.id,
          reason,
          nextAttemptAt,
          nextAttempt,
          leaseRef,
        );
      } catch (markRetryError) {
        if (markRetryError instanceof InvoiceJobLeaseError) {
          return {
            status: "failed",
            jobId: job.id,
            reason: markRetryError.message,
          };
        }
        throw markRetryError;
      }

      await notifyObserver("job_retry_scheduled", () =>
        observer.onJobRetryScheduled?.(job, reason, nextAttemptAt, nextAttempt),
      );

      return {
        status: "retry_scheduled",
        jobId: job.id,
        reason,
        nextAttemptAt,
      };
    }

    try {
      await deps.invoiceJobStore.markDeadLetter(job.id, reason, leaseRef);
    } catch (markDeadLetterError) {
      if (markDeadLetterError instanceof InvoiceJobLeaseError) {
        return {
          status: "failed",
          jobId: job.id,
          reason: markDeadLetterError.message,
        };
      }
      throw markDeadLetterError;
    }
    await notifyObserver("job_dead_lettered", () =>
      observer.onJobDeadLettered?.(job, reason),
    );

    return {
      status: "failed",
      jobId: job.id,
      reason,
    };
  } finally {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
  }
}
