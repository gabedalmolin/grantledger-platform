import { getSharedInvoiceUseCaseDeps, type InvoiceUseCaseDeps } from "@grantledger/application";
import { createPostgresInvoiceUseCaseDeps } from "@grantledger/infra-postgres";
import type { Pool } from "pg";

import type { InvoiceHandlersDeps } from "../handlers/invoice.js";

type PersistenceDriver = "memory" | "postgres";

export interface CreateInvoiceHandlerDepsInput {
  invoiceUseCases?: InvoiceUseCaseDeps;
  invoiceUseCasesByTenant?: (tenantId: string) => InvoiceUseCaseDeps;
  persistenceDriver: PersistenceDriver;
  postgresPool?: Pool | null;
}

export function createInvoiceHandlerDeps(
  input: CreateInvoiceHandlerDepsInput,
): InvoiceHandlersDeps {
  const inMemoryInvoiceUseCases =
    input.invoiceUseCases ?? getSharedInvoiceUseCaseDeps();

  const invoiceUseCasesByTenant = input.invoiceUseCasesByTenant
    ? input.invoiceUseCasesByTenant
    : input.invoiceUseCases
      ? null
      : createTenantInvoiceUseCaseResolver({
        persistenceDriver: input.persistenceDriver,
        postgresPool: input.postgresPool ?? null,
        fallbackUseCases: inMemoryInvoiceUseCases,
      });
  return {
    invoiceUseCases: inMemoryInvoiceUseCases,
    ...(invoiceUseCasesByTenant ? { invoiceUseCasesByTenant } : {}),
  };
}

function createTenantInvoiceUseCaseResolver(input: {
  persistenceDriver: PersistenceDriver;
  postgresPool: Pool | null;
  fallbackUseCases: InvoiceUseCaseDeps;
}): (tenantId: string) => InvoiceUseCaseDeps {
  const byTenant = new Map<string, InvoiceUseCaseDeps>();

  return (tenantId: string): InvoiceUseCaseDeps => {
    if (input.persistenceDriver !== "postgres" || !input.postgresPool) {
      return input.fallbackUseCases;
    }

    const cached = byTenant.get(tenantId);
    if (cached) {
      return cached;
    }

    const created = createPostgresInvoiceUseCaseDeps(
      input.postgresPool,
      tenantId,
    );
    byTenant.set(tenantId, created);
    return created;
  };
}