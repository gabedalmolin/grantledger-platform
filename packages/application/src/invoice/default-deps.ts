import { createInMemoryAsyncIdempotencyStore } from "../idempotency.js";

import {
  createConsoleInvoiceAuditLogger,
  createInMemoryInvoiceJobStore,
  createInMemoryInvoiceRepository,
} from "./in-memory.js";
import type {
  InvoiceUseCaseDeps,
} from "./types.js";
import type { EnqueueInvoiceGenerationResponse } from "@grantledger/contracts";

export function createDefaultInvoiceUseCaseDeps(): InvoiceUseCaseDeps {
  return {
    invoiceRepository: createInMemoryInvoiceRepository(),
    invoiceAuditLogger: createConsoleInvoiceAuditLogger(),
    invoiceJobStore: createInMemoryInvoiceJobStore(),
    enqueueIdempotencyStore:
      createInMemoryAsyncIdempotencyStore<EnqueueInvoiceGenerationResponse>(),
    processIdempotencyStore: createInMemoryAsyncIdempotencyStore<{
      invoiceId: string;
    }>(),
  };
}

const sharedInvoiceUseCaseDeps = createDefaultInvoiceUseCaseDeps();

export function getSharedInvoiceUseCaseDeps(): InvoiceUseCaseDeps {
  return sharedInvoiceUseCaseDeps;
}
