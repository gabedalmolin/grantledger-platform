import type { GetInvoiceGenerationJobStatusResponse } from "@grantledger/contracts";

import { InvoiceGenerationJobNotFoundError } from "./types.js";
import type { InvoiceUseCaseDeps } from "./types.js";

export async function getInvoiceGenerationJobStatus(
  deps: Pick<InvoiceUseCaseDeps, "invoiceJobStore">,
  jobId: string,
  tenantId?: string,
): Promise<GetInvoiceGenerationJobStatusResponse> {
  const job = await deps.invoiceJobStore.get(jobId);

  if (!job) {
    throw new InvoiceGenerationJobNotFoundError();
  }

  if (tenantId !== undefined && job.input.tenantId !== tenantId) {
    throw new InvoiceGenerationJobNotFoundError();
  }

  return {
    jobId: job.id,
    status: job.status,
    ...(job.invoiceId !== undefined ? { invoiceId: job.invoiceId } : {}),
    ...(job.reason !== undefined ? { reason: job.reason } : {}),
  };
}
