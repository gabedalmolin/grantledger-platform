import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceUseCaseDeps } from "@grantledger/application";
import type { Pool } from "pg";

const { createPostgresInvoiceUseCaseDeps } = vi.hoisted(() => ({
  createPostgresInvoiceUseCaseDeps: vi.fn(),
}));

vi.mock("@grantledger/infra-postgres", () => ({
  createPostgresInvoiceUseCaseDeps,
}));

import { createInvoiceHandlerDeps } from "./invoice-deps.js";

describe("createInvoiceHandlerDeps", () => {
  beforeEach(() => {
    createPostgresInvoiceUseCaseDeps.mockReset();
  });

  it("uses provided invoice use cases directly when supplied", () => {
    const invoiceUseCases = {
      marker: "provided",
    } as unknown as InvoiceUseCaseDeps;

    const deps = createInvoiceHandlerDeps({
      persistenceDriver: "memory",
      invoiceUseCases,
    });

    expect(deps.invoiceUseCases).toBe(invoiceUseCases);
    expect(deps.invoiceUseCasesByTenant).toBeUndefined();
  });

  it("uses a provided tenant resolver when supplied", () => {
    const invoiceUseCases = {
      marker: "base",
    } as unknown as InvoiceUseCaseDeps;

    const tenantUseCases = {
      marker: "tenant-specific",
    } as unknown as InvoiceUseCaseDeps;

    const invoiceUseCasesByTenant = vi.fn(() => tenantUseCases);

    const deps = createInvoiceHandlerDeps({
      persistenceDriver: "memory",
      invoiceUseCases,
      invoiceUseCasesByTenant,
    });

    expect(deps.invoiceUseCases).toBe(invoiceUseCases);
    expect(deps.invoiceUseCasesByTenant?.("tenant_1")).toBe(tenantUseCases);
    expect(invoiceUseCasesByTenant).toHaveBeenCalledWith("tenant_1");
  });

  it("falls back to the in-memory use cases in memory mode", () => {
    const deps = createInvoiceHandlerDeps({
      persistenceDriver: "memory",
    });

    expect(deps.invoiceUseCasesByTenant).toBeDefined();
    expect(deps.invoiceUseCasesByTenant?.("tenant_1")).toBe(deps.invoiceUseCases);
    expect(deps.invoiceUseCasesByTenant?.("tenant_2")).toBe(deps.invoiceUseCases);
  });

  it("creates and caches tenant-specific Postgres use cases in postgres mode", () => {
    const pool = {} as Pool;

    const tenantAUseCases = {
      marker: "tenant-a",
    } as unknown as InvoiceUseCaseDeps;

    const tenantBUseCases = {
      marker: "tenant-b",
    } as unknown as InvoiceUseCaseDeps;

    createPostgresInvoiceUseCaseDeps.mockImplementation(
      (_pool: Pool, tenantId: string) =>
        tenantId === "tenant_a" ? tenantAUseCases : tenantBUseCases,
    );

    const deps = createInvoiceHandlerDeps({
      persistenceDriver: "postgres",
      postgresPool: pool,
    });

    const tenantAFirst = deps.invoiceUseCasesByTenant?.("tenant_a");
    const tenantASecond = deps.invoiceUseCasesByTenant?.("tenant_a");
    const tenantB = deps.invoiceUseCasesByTenant?.("tenant_b");

    expect(tenantAFirst).toBe(tenantAUseCases);
    expect(tenantASecond).toBe(tenantAUseCases);
    expect(tenantB).toBe(tenantBUseCases);

    expect(createPostgresInvoiceUseCaseDeps).toHaveBeenCalledTimes(2);
    expect(createPostgresInvoiceUseCaseDeps).toHaveBeenNthCalledWith(
      1,
      pool,
      "tenant_a",
    );
    expect(createPostgresInvoiceUseCaseDeps).toHaveBeenNthCalledWith(
      2,
      pool,
      "tenant_b",
    );
  });
});