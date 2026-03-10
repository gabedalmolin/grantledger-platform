import type {
  GenerateInvoiceForCycleInput,
  Invoice,
} from "@grantledger/contracts";
import {
  assertInvoiceTotalDerivedFromLines,
  buildInvoiceSnapshot,
  calculateInvoiceBreakdown,
  calculateInvoiceLines,
} from "@grantledger/domain";

import { resolveId, resolveNow } from "./job-utils.js";
import type { InvoiceUseCaseDeps } from "./types.js";

export function buildInvoice(
  deps: InvoiceUseCaseDeps,
  input: GenerateInvoiceForCycleInput,
): Invoice {
  const createdAt = resolveNow(deps);
  const lines = calculateInvoiceLines(input);
  const breakdown = calculateInvoiceBreakdown(lines);
  const snapshot = buildInvoiceSnapshot(input);

  const invoice: Invoice = {
    id: resolveId(deps),
    tenantId: input.tenantId,
    subscriptionId: input.subscriptionId,
    status: "issued",
    snapshot,
    lines,
    breakdown,
    issuedAt: createdAt,
    createdAt,
  };

  assertInvoiceTotalDerivedFromLines(invoice);
  return invoice;
}
