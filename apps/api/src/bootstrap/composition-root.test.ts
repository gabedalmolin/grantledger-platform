import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubscriptionUseCaseDeps } from "@grantledger/application";
import type { Pool } from "pg";

const {
  createStartCheckoutHandler,
  createSubscriptionHandlers,
  createInvoiceHandlers,
  createWebhookHandlers,
  createInMemorySubscriptionUseCaseDeps,
  createInvoiceHandlerDeps,
  createWebhookHandlerDeps,
  createPostgresPool,
  createPostgresSubscriptionUseCaseDeps,
} = vi.hoisted(() => ({
  createStartCheckoutHandler: vi.fn(),
  createSubscriptionHandlers: vi.fn(),
  createInvoiceHandlers: vi.fn(),
  createWebhookHandlers: vi.fn(),
  createInMemorySubscriptionUseCaseDeps: vi.fn(),
  createInvoiceHandlerDeps: vi.fn(),
  createWebhookHandlerDeps: vi.fn(),
  createPostgresPool: vi.fn(),
  createPostgresSubscriptionUseCaseDeps: vi.fn(),
}));

vi.mock("../handlers/checkout.js", () => ({
  createStartCheckoutHandler,
}));

vi.mock("../handlers/subscription.js", () => ({
  createSubscriptionHandlers,
}));

vi.mock("../handlers/invoice.js", () => ({
  createInvoiceHandlers,
}));

vi.mock("../handlers/webhook.js", () => ({
  createWebhookHandlers,
}));

vi.mock("./subscription-deps.js", () => ({
  createInMemorySubscriptionUseCaseDeps,
}));

vi.mock("./invoice-deps.js", () => ({
  createInvoiceHandlerDeps,
}));

vi.mock("./webhook-deps.js", () => ({
  createWebhookHandlerDeps,
}));

vi.mock("@grantledger/infra-postgres", () => ({
  createPostgresPool,
  createPostgresSubscriptionUseCaseDeps,
}));

import { createApiCompositionRoot } from "./composition-root.js";

describe("createApiCompositionRoot", () => {
  beforeEach(() => {
    createStartCheckoutHandler.mockReset();
    createSubscriptionHandlers.mockReset();
    createInvoiceHandlers.mockReset();
    createWebhookHandlers.mockReset();
    createInMemorySubscriptionUseCaseDeps.mockReset();
    createInvoiceHandlerDeps.mockReset();
    createWebhookHandlerDeps.mockReset();
    createPostgresPool.mockReset();
    createPostgresSubscriptionUseCaseDeps.mockReset();
  });

  it("wires default handlers through the bootstrap factories in memory mode", () => {
    const startCheckoutHandler = vi.fn();
    const subscriptionHandlers = {
      handleCreateSubscriptionCommand: vi.fn(),
      handleUpgradeSubscriptionCommand: vi.fn(),
      handleDowngradeSubscriptionCommand: vi.fn(),
      handleCancelSubscriptionNowCommand: vi.fn(),
      handleCancelSubscriptionAtPeriodEndCommand: vi.fn(),
    };
    const invoiceHandlers = {
      handleEnqueueInvoiceGeneration: vi.fn(),
      handleGetInvoiceGenerationJobStatus: vi.fn(),
    };
    const webhookHandlers = {
      handleProviderWebhook: vi.fn(),
    };

    const inMemorySubscriptionUseCases = {
      marker: "in-memory-subscription-use-cases",
    } as unknown as SubscriptionUseCaseDeps;

    const invoiceHandlerDeps = { marker: "invoice-handler-deps" };
    const webhookHandlerDeps = { marker: "webhook-handler-deps" };

    createStartCheckoutHandler.mockReturnValue(startCheckoutHandler);
    createSubscriptionHandlers.mockReturnValue(subscriptionHandlers);
    createInvoiceHandlers.mockReturnValue(invoiceHandlers);
    createWebhookHandlers.mockReturnValue(webhookHandlers);
    createInMemorySubscriptionUseCaseDeps.mockReturnValue(
      inMemorySubscriptionUseCases,
    );
    createInvoiceHandlerDeps.mockReturnValue(invoiceHandlerDeps);
    createWebhookHandlerDeps.mockReturnValue(webhookHandlerDeps);

    const root = createApiCompositionRoot({
      persistenceDriver: "memory",
    });

    expect(createInMemorySubscriptionUseCaseDeps).toHaveBeenCalledTimes(1);

    expect(createSubscriptionHandlers).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionUseCases: inMemorySubscriptionUseCases,
        clock: expect.any(Object),
        idGenerator: expect.any(Object),
      }),
    );

    expect(createInvoiceHandlerDeps).toHaveBeenCalledWith(
      expect.objectContaining({
        persistenceDriver: "memory",
      }),
    );
    expect(createInvoiceHandlers).toHaveBeenCalledWith(invoiceHandlerDeps);

    expect(createWebhookHandlerDeps).toHaveBeenCalledWith(
      expect.objectContaining({
        persistenceDriver: "memory",
      }),
    );
    expect(createWebhookHandlers).toHaveBeenCalledWith(webhookHandlerDeps);

    expect(root.handleStartCheckout).toBe(startCheckoutHandler);
    expect(root.invoiceHandlers).toBe(invoiceHandlers);
    expect(root.webhookHandlers).toBe(webhookHandlers);
    expect(root.handleCreateSubscriptionCommand).toBe(
      subscriptionHandlers.handleCreateSubscriptionCommand,
    );
  });

  it("reuses injected invoice and webhook handlers without recreating them", () => {
    const subscriptionHandlers = {
      handleCreateSubscriptionCommand: vi.fn(),
      handleUpgradeSubscriptionCommand: vi.fn(),
      handleDowngradeSubscriptionCommand: vi.fn(),
      handleCancelSubscriptionNowCommand: vi.fn(),
      handleCancelSubscriptionAtPeriodEndCommand: vi.fn(),
    };

    const injectedInvoiceHandlers = {
      handleEnqueueInvoiceGeneration: vi.fn(),
      handleGetInvoiceGenerationJobStatus: vi.fn(),
    };

    const injectedWebhookHandlers = {
      handleProviderWebhook: vi.fn(),
    };

    createStartCheckoutHandler.mockReturnValue(vi.fn());
    createSubscriptionHandlers.mockReturnValue(subscriptionHandlers);
    createInMemorySubscriptionUseCaseDeps.mockReturnValue(
      {} as SubscriptionUseCaseDeps,
    );

    const root = createApiCompositionRoot({
      persistenceDriver: "memory",
      invoiceHandlers: injectedInvoiceHandlers,
      webhookHandlers: injectedWebhookHandlers,
    });

    expect(createInvoiceHandlers).not.toHaveBeenCalled();
    expect(createWebhookHandlers).not.toHaveBeenCalled();

    expect(root.invoiceHandlers).toBe(injectedInvoiceHandlers);
    expect(root.webhookHandlers).toBe(injectedWebhookHandlers);
  });

  it("creates and caches tenant-specific Postgres subscription use cases", () => {
    const pool = {} as Pool;

    const subscriptionHandlers = {
      handleCreateSubscriptionCommand: vi.fn(),
      handleUpgradeSubscriptionCommand: vi.fn(),
      handleDowngradeSubscriptionCommand: vi.fn(),
      handleCancelSubscriptionNowCommand: vi.fn(),
      handleCancelSubscriptionAtPeriodEndCommand: vi.fn(),
    };

    const inMemorySubscriptionUseCases = {
      marker: "in-memory-subscription-use-cases",
    } as unknown as SubscriptionUseCaseDeps;

    const tenantAUseCases = {
      marker: "tenant-a",
    } as unknown as SubscriptionUseCaseDeps;

    const tenantBUseCases = {
      marker: "tenant-b",
    } as unknown as SubscriptionUseCaseDeps;

    createStartCheckoutHandler.mockReturnValue(vi.fn());
    createSubscriptionHandlers.mockReturnValue(subscriptionHandlers);
    createInMemorySubscriptionUseCaseDeps.mockReturnValue(
      inMemorySubscriptionUseCases,
    );
    createInvoiceHandlerDeps.mockReturnValue({});
    createInvoiceHandlers.mockReturnValue({
      handleEnqueueInvoiceGeneration: vi.fn(),
      handleGetInvoiceGenerationJobStatus: vi.fn(),
    });
    createWebhookHandlerDeps.mockReturnValue({});
    createWebhookHandlers.mockReturnValue({
      handleProviderWebhook: vi.fn(),
    });
    createPostgresPool.mockReturnValue(pool);

    createPostgresSubscriptionUseCaseDeps.mockImplementation(
      (_pool: Pool, tenantId: string) =>
        tenantId === "tenant_a" ? tenantAUseCases : tenantBUseCases,
    );

    createApiCompositionRoot({
      persistenceDriver: "postgres",
    });

    const subscriptionHandlersDeps = createSubscriptionHandlers.mock.calls[0]?.[0] as {
      subscriptionUseCases: SubscriptionUseCaseDeps;
      subscriptionUseCasesByTenant?: (tenantId: string) => SubscriptionUseCaseDeps;
    };

    expect(subscriptionHandlersDeps.subscriptionUseCases).toBe(
      inMemorySubscriptionUseCases,
    );
    expect(subscriptionHandlersDeps.subscriptionUseCasesByTenant).toBeDefined();

    const tenantAFirst =
      subscriptionHandlersDeps.subscriptionUseCasesByTenant?.("tenant_a");
    const tenantASecond =
      subscriptionHandlersDeps.subscriptionUseCasesByTenant?.("tenant_a");
    const tenantB =
      subscriptionHandlersDeps.subscriptionUseCasesByTenant?.("tenant_b");

    expect(tenantAFirst).toBe(tenantAUseCases);
    expect(tenantASecond).toBe(tenantAUseCases);
    expect(tenantB).toBe(tenantBUseCases);

    expect(createPostgresPool).toHaveBeenCalledTimes(1);
    expect(createPostgresSubscriptionUseCaseDeps).toHaveBeenCalledTimes(2);
    expect(createPostgresSubscriptionUseCaseDeps).toHaveBeenNthCalledWith(
      1,
      pool,
      "tenant_a",
    );
    expect(createPostgresSubscriptionUseCaseDeps).toHaveBeenNthCalledWith(
      2,
      pool,
      "tenant_b",
    );
  });
});
