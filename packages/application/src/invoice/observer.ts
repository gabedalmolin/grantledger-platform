import { emitStructuredLog } from "@grantledger/shared";

import type { InvoiceJobObserver, InvoiceUseCaseDeps } from "./types.js";

const noopInvoiceJobObserver: InvoiceJobObserver = {};

export function observerOf(
  deps: Pick<InvoiceUseCaseDeps, "jobObserver">,
): InvoiceJobObserver {
  return deps.jobObserver ?? noopInvoiceJobObserver;
}

export async function notifyObserver(
  event: string,
  callback: () => Promise<void> | void,
): Promise<void> {
  try {
    await callback();
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Unexpected observer failure";

    emitStructuredLog({
      level: "warn",
      type: "invoice_job_observer_error",
      payload: {
        event,
        reason,
      },
    });
  }
}
