import type { Invoice, InvoiceAuditEvent } from "@grantledger/contracts";
import {
  addSecondsToIso,
  emitStructuredLog,
  parseIsoToEpochMillis,
  utcNowIso,
} from "@grantledger/shared";

import { cloneJob, requireJob, stripLeaseMetadata } from "./job-utils.js";
import {
  InvoiceJobLeaseError,
  type InvoiceAuditLogger,
  type InvoiceGenerationJob,
  type InvoiceJobLease,
  type InvoiceJobStore,
  type InvoiceRepository,
} from "./types.js";

export function createInMemoryInvoiceRepository(): InvoiceRepository {
  const byCycleKey = new Map<string, Invoice>();

  return {
    async findByCycleKey(cycleKey: string): Promise<Invoice | null> {
      return byCycleKey.get(cycleKey) ?? null;
    },
    async save(invoice: Invoice, cycleKey: string): Promise<void> {
      byCycleKey.set(cycleKey, invoice);
    },
  };
}

export function createConsoleInvoiceAuditLogger(): InvoiceAuditLogger {
  return {
    async log(event: InvoiceAuditEvent): Promise<void> {
      emitStructuredLog({
        type: "invoice_audit",
        payload: event as unknown as Record<string, unknown>,
      });
    },
  };
}

export function createInMemoryInvoiceJobStore(
  now: () => string = utcNowIso,
): InvoiceJobStore {
  const jobs = new Map<string, InvoiceGenerationJob>();

  function assertLeaseOwnership(
    current: InvoiceGenerationJob,
    lease: InvoiceJobLease,
  ): void {
    if (
      current.leaseOwner !== lease.workerId ||
      current.leaseToken !== lease.leaseToken
    ) {
      throw new InvoiceJobLeaseError();
    }
  }

  return {
    async enqueue(job: InvoiceGenerationJob): Promise<void> {
      jobs.set(job.id, cloneJob(job));
    },
    async claimNext(input) {
      const nowIso = now();
      const nowMillis = parseIsoToEpochMillis(nowIso);

      for (const [jobId, candidate] of jobs.entries()) {
        const isQueuedReady = (() => {
          if (candidate.status !== "queued") return false;
          try {
            return parseIsoToEpochMillis(candidate.nextAttemptAt) <= nowMillis;
          } catch {
            return false;
          }
        })();

        const isExpiredProcessing = (() => {
          if (candidate.status !== "processing") return false;
          if (!candidate.leaseExpiresAt) return false;
          try {
            return parseIsoToEpochMillis(candidate.leaseExpiresAt) <= nowMillis;
          } catch {
            return false;
          }
        })();

        if (!isQueuedReady && !isExpiredProcessing) {
          continue;
        }

        const claimed: InvoiceGenerationJob = {
          ...candidate,
          status: "processing",
          updatedAt: nowIso,
          leaseOwner: input.workerId,
          leaseToken: input.leaseToken,
          leaseExpiresAt: addSecondsToIso(nowIso, input.leaseSeconds),
        };

        jobs.set(jobId, claimed);
        return cloneJob(claimed);
      }

      return null;
    },

    async renewLease(jobId, lease, leaseSeconds): Promise<void> {
      const current = requireJob(jobs, jobId);
      assertLeaseOwnership(current, lease);

      const nowIso = now();
      jobs.set(jobId, {
        ...current,
        leaseExpiresAt: addSecondsToIso(nowIso, leaseSeconds),
        updatedAt: nowIso,
      });
    },

    async get(jobId: string): Promise<InvoiceGenerationJob | null> {
      const job = jobs.get(jobId);
      return job ? cloneJob(job) : null;
    },

    async markCompleted(jobId, invoiceId, lease): Promise<void> {
      const current = requireJob(jobs, jobId);
      assertLeaseOwnership(current, lease);
      jobs.set(jobId, {
        ...stripLeaseMetadata(current),
        status: "completed",
        updatedAt: now(),
        invoiceId,
      });
    },

    async markRetry(
      jobId,
      reason,
      nextAttemptAt,
      attemptCount,
      lease,
    ): Promise<void> {
      const current = requireJob(jobs, jobId);
      assertLeaseOwnership(current, lease);
      jobs.set(jobId, {
        ...stripLeaseMetadata(current),
        status: "queued",
        reason,
        lastError: reason,
        attemptCount,
        nextAttemptAt,
        updatedAt: now(),
      });
    },

    async markDeadLetter(jobId, reason, lease): Promise<void> {
      const current = requireJob(jobs, jobId);
      assertLeaseOwnership(current, lease);
      const deadLetteredAt = now();
      jobs.set(jobId, {
        ...stripLeaseMetadata(current),
        status: "failed",
        reason,
        lastError: reason,
        deadLetteredAt,
        updatedAt: deadLetteredAt,
      });
    },
  };
}
