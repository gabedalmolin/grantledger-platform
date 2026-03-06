import {
  createInMemoryAsyncIdempotencyStore,
  getSharedInvoiceUseCaseDeps,
  type InvoiceUseCaseDeps,
  type PaymentProvider,
  type SubscriptionUseCaseDeps,
} from "@grantledger/application";
import {
  createPostgresInvoiceUseCaseDeps,
  createPostgresPool,
  createPostgresSubscriptionUseCaseDeps,
  createPostgresWebhookAuditStore,
  createPostgresWebhookIdempotencyStore,
} from "@grantledger/infra-postgres";
import type {
  CanonicalPaymentEvent,
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResult,
} from "@grantledger/contracts";
import {
  CryptoIdGenerator,
  SystemClock,
  type Clock,
  type IdGenerator,
} from "@grantledger/shared";
import type { Pool } from "pg";

import {
  createStartCheckoutHandler,
  type StartCheckoutHandler,
} from "../handlers/checkout.js";
import {
  createInvoiceHandlers,
  type InvoiceHandlers,
} from "../handlers/invoice.js";
import {
  createWebhookHandlers,
  StructuredLogCanonicalEventPublisher,
  StructuredLogWebhookAuditStore,
  type WebhookHandlerDeps,
  type WebhookHandlers,
} from "../handlers/webhook.js";
import {
  createInMemorySubscriptionUseCaseDeps,
  createSubscriptionHandlers,
  type SubscriptionHandlers,
} from "../handlers/subscription.js";

class FakePaymentProvider implements PaymentProvider {
  public readonly name = "fake" as const;

  constructor(
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) { }

  createCheckoutSession(
    _input: CreateCheckoutSessionInput,
  ): CreateCheckoutSessionResult {
    void _input;
    const token = this.idGenerator.next().replace(/-/g, "").slice(0, 12);
    const sessionId = `fake_chk_${token}`;

    return {
      provider: this.name,
      sessionId,
      checkoutUrl: `https://pay.local/checkout/${sessionId}`,
      createdAt: this.clock.nowIso(),
    };
  }
}

export interface ApiCompositionRootDeps {
  clock?: Clock;
  idGenerator?: IdGenerator;
  paymentProvider?: PaymentProvider;
  invoiceHandlers?: InvoiceHandlers;
  invoiceUseCases?: InvoiceUseCaseDeps;
  invoiceUseCasesByTenant?: (tenantId: string) => InvoiceUseCaseDeps;
  webhookHandlers?: WebhookHandlers;
  webhookHandlerDeps?: WebhookHandlerDeps;
  subscriptionUseCases?: SubscriptionUseCaseDeps;
  subscriptionUseCasesByTenant?: (tenantId: string) => SubscriptionUseCaseDeps;
  persistenceDriver?: "memory" | "postgres";
  postgresPool?: Pool;
}

export interface ApiCompositionRoot extends SubscriptionHandlers {
  handleStartCheckout: StartCheckoutHandler;
  invoiceHandlers: InvoiceHandlers;
  webhookHandlers: WebhookHandlers;
}

function resolvePersistenceDriver(
  explicit?: "memory" | "postgres",
): "memory" | "postgres" {
  if (explicit) {
    return explicit;
  }
  return process.env.PERSISTENCE_DRIVER === "postgres" ? "postgres" : "memory";
}

export function createApiCompositionRoot(
  deps: ApiCompositionRootDeps = {},
): ApiCompositionRoot {
  const clock = deps.clock ?? new SystemClock();
  const idGenerator = deps.idGenerator ?? new CryptoIdGenerator();
  const paymentProvider =
    deps.paymentProvider ?? new FakePaymentProvider(idGenerator, clock);
  const persistenceDriver = resolvePersistenceDriver(deps.persistenceDriver);

  const inMemorySubscriptionUseCases =
    deps.subscriptionUseCases ?? createInMemorySubscriptionUseCaseDeps();
  const inMemoryInvoiceUseCases =
    deps.invoiceUseCases ?? getSharedInvoiceUseCaseDeps();

  const pool =
    persistenceDriver === "postgres"
      ? deps.postgresPool ?? createPostgresPool()
      : null;

  const postgresSubscriptionUseCasesByTenant =
    new Map<string, SubscriptionUseCaseDeps>();
  const postgresInvoiceUseCasesByTenant = new Map<string, InvoiceUseCaseDeps>();

  const subscriptionUseCasesByTenant = deps.subscriptionUseCasesByTenant
    ? deps.subscriptionUseCasesByTenant
    : deps.subscriptionUseCases
      ? null
      : (tenantId: string): SubscriptionUseCaseDeps => {
        if (persistenceDriver !== "postgres" || !pool) {
          return inMemorySubscriptionUseCases;
        }

        const cached = postgresSubscriptionUseCasesByTenant.get(tenantId);
        if (cached) {
          return cached;
        }

        const created = createPostgresSubscriptionUseCaseDeps(pool, tenantId);
        postgresSubscriptionUseCasesByTenant.set(tenantId, created);
        return created;
      };

  const invoiceUseCasesByTenant = deps.invoiceUseCasesByTenant
    ? deps.invoiceUseCasesByTenant
    : deps.invoiceUseCases
      ? null
      : (tenantId: string): InvoiceUseCaseDeps => {
        if (persistenceDriver !== "postgres" || !pool) {
          return inMemoryInvoiceUseCases;
        }

        const cached = postgresInvoiceUseCasesByTenant.get(tenantId);
        if (cached) {
          return cached;
        }

        const created = createPostgresInvoiceUseCaseDeps(pool, tenantId);
        postgresInvoiceUseCasesByTenant.set(tenantId, created);
        return created;
      };

  const subscriptionHandlers = createSubscriptionHandlers({
    subscriptionUseCases: inMemorySubscriptionUseCases,
    ...(subscriptionUseCasesByTenant
      ? { subscriptionUseCasesByTenant }
      : {}),
    clock,
    idGenerator,
  });

  const invoiceHandlers =
    deps.invoiceHandlers ??
    createInvoiceHandlers({
      invoiceUseCases: inMemoryInvoiceUseCases,
      ...(invoiceUseCasesByTenant ? { invoiceUseCasesByTenant } : {}),
    });

  const webhookHandlerDeps: WebhookHandlerDeps =
    deps.webhookHandlerDeps ??
    (persistenceDriver === "postgres" && pool
      ? {
        idempotencyStore: createPostgresWebhookIdempotencyStore(pool),
        auditStore: createPostgresWebhookAuditStore(pool),
        eventPublisher: new StructuredLogCanonicalEventPublisher(),
        ...(process.env.STRIPE_WEBHOOK_SECRET
          ? { stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET }
          : {}),
      }
      : {
        idempotencyStore:
          createInMemoryAsyncIdempotencyStore<CanonicalPaymentEvent>(),
        auditStore: new StructuredLogWebhookAuditStore(),
        eventPublisher: new StructuredLogCanonicalEventPublisher(),
        ...(process.env.STRIPE_WEBHOOK_SECRET
          ? { stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET }
          : {}),
      });

  const webhookHandlers =
    deps.webhookHandlers ?? createWebhookHandlers(webhookHandlerDeps);

  return {
    handleStartCheckout: createStartCheckoutHandler({ paymentProvider }),
    ...subscriptionHandlers,
    invoiceHandlers,
    webhookHandlers,
  };
}
