import type {
  EnqueueInvoiceGenerationPayload,
  EnqueueInvoiceGenerationResponse,
  GenerateInvoiceForCycleInput,
  Invoice,
  InvoiceAuditEvent,
  InvoiceGenerationJobStatus,
} from "@grantledger/contracts";

import { ConflictError, NotFoundError } from "../errors.js";
import type { AsyncIdempotencyStore } from "../idempotency.js";

export interface InvoiceRepository {
  findByCycleKey(cycleKey: string): Promise<Invoice | null>;
  save(invoice: Invoice, cycleKey: string): Promise<void>;
}

export interface InvoiceAuditLogger {
  log(event: InvoiceAuditEvent): Promise<void>;
}

export interface InvoiceGenerationJob {
  id: string;
  status: InvoiceGenerationJobStatus;
  cycleKey: string;
  input: GenerateInvoiceForCycleInput;
  createdAt: string;
  updatedAt: string;
  invoiceId?: string;
  reason?: string;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError?: string;
  deadLetteredAt?: string;
  replayOfJobId?: string;
  replayReason?: string;
  leaseOwner?: string;
  leaseToken?: string;
  leaseExpiresAt?: string;
}

export interface InvoiceJobLease {
  workerId: string;
  leaseToken: string;
}

export interface InvoiceJobClaimInput extends InvoiceJobLease {
  leaseSeconds: number;
}

export interface InvoiceJobStore {
  enqueue(job: InvoiceGenerationJob): Promise<void>;
  claimNext(input: InvoiceJobClaimInput): Promise<InvoiceGenerationJob | null>;
  renewLease(
    jobId: string,
    lease: InvoiceJobLease,
    leaseSeconds: number,
  ): Promise<void>;
  get(jobId: string): Promise<InvoiceGenerationJob | null>;
  markCompleted(
    jobId: string,
    invoiceId: string,
    lease: InvoiceJobLease,
  ): Promise<void>;
  markRetry(
    jobId: string,
    reason: string,
    nextAttemptAt: string,
    attemptCount: number,
    lease: InvoiceJobLease,
  ): Promise<void>;
  markDeadLetter(
    jobId: string,
    reason: string,
    lease: InvoiceJobLease,
  ): Promise<void>;
}

export interface InvoiceJobObserver {
  onJobClaimed?(job: InvoiceGenerationJob): Promise<void> | void;
  onJobCompleted?(
    job: InvoiceGenerationJob,
    invoiceId: string,
  ): Promise<void> | void;
  onJobRetryScheduled?(
    job: InvoiceGenerationJob,
    reason: string,
    nextAttemptAt: string,
    attemptCount: number,
  ): Promise<void> | void;
  onJobDeadLettered?(
    job: InvoiceGenerationJob,
    reason: string,
  ): Promise<void> | void;
  onJobEnqueued?(job: InvoiceGenerationJob): Promise<void> | void;
}

export interface ReplayInvoiceGenerationJobInput {
  jobId: string;
  reason?: string;
}

export type ReplayInvoiceGenerationJobResult =
  | { status: "replayed"; jobId: string; replayOfJobId: string }
  | { status: "skipped_already_completed"; jobId: string; invoiceId: string };

export interface InvoiceUseCaseDeps {
  invoiceRepository: InvoiceRepository;
  invoiceAuditLogger: InvoiceAuditLogger;
  invoiceJobStore: InvoiceJobStore;
  jobObserver?: InvoiceJobObserver;
  enqueueIdempotencyStore: AsyncIdempotencyStore<EnqueueInvoiceGenerationResponse>;
  processIdempotencyStore: AsyncIdempotencyStore<{ invoiceId: string }>;
  now?: () => string;
  generateId?: () => string;
}

export interface EnqueueInvoiceGenerationInput {
  idempotencyKey: string | null;
  payload: EnqueueInvoiceGenerationPayload;
}

export interface EnqueueInvoiceGenerationResult
  extends EnqueueInvoiceGenerationResponse {
  replayed: boolean;
}

export interface ProcessNextInvoiceGenerationJobInput {
  lease?: InvoiceJobClaimInput;
  heartbeatSeconds?: number;
}

export type ProcessNextInvoiceGenerationJobResult =
  | { status: "no_job" }
  | { status: "processed"; jobId: string; invoiceId: string }
  | {
      status: "retry_scheduled";
      jobId: string;
      reason: string;
      nextAttemptAt: string;
    }
  | { status: "failed"; jobId: string; reason: string };

export class InvoiceGenerationJobNotFoundError extends NotFoundError {
  constructor(message = "Invoice generation job not found") {
    super(message);
  }
}

export class InvoiceJobReplayNotAllowedError extends ConflictError {
  constructor(message = "Only failed jobs can be replayed") {
    super(message);
  }
}

export class InvoiceJobLeaseError extends ConflictError {
  constructor(message = "Invoice job lease is no longer owned by this worker") {
    super(message);
  }
}

export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_LEASE_SECONDS = 30;
