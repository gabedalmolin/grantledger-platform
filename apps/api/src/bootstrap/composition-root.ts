import type {
  InvoiceUseCaseDeps,
  PaymentProvider,
  SubscriptionUseCaseDeps,
} from "@grantledger/application";
import {
  createPostgresPool,
  createPostgresSubscriptionUseCaseDeps,
} from "@grantledger/infra-postgres";
import type {
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResult,
} from "@grantledger/contracts";
import {
  CryptoIdGenerator,
  SystemClock,
  type Clock,
  type IdGenerator,
} from "@grantledger/shared";
import { Pool } from "pg";

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
  type WebhookHandlerDeps,
  type WebhookHandlers,
} from "../handlers/webhook.js";
import {
  createSubscriptionHandlers,
  type SubscriptionHandlers,
} from "../handlers/subscription.js";
import { createInMemorySubscriptionUseCaseDeps } from "./subscription-deps.js";
import { createInvoiceHandlerDeps } from "./invoice-deps.js";
import { createWebhookHandlerDeps } from "./webhook-deps.js";



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

  const pool =
    persistenceDriver === "postgres"
      ? deps.postgresPool ?? createPostgresPool()
      : null;

  const postgresSubscriptionUseCasesByTenant =
    new Map<string, SubscriptionUseCaseDeps>();

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

  const subscriptionHandlers = createSubscriptionHandlers({
    subscriptionUseCases: inMemorySubscriptionUseCases,
    ...(subscriptionUseCasesByTenant
      ? { subscriptionUseCasesByTenant }
      : {}),
    clock,
    idGenerator,
  });

  const invoiceHandlerDeps = createInvoiceHandlerDeps({
    persistenceDriver,
    ...(deps.invoiceUseCases
      ? { invoiceUseCases: deps.invoiceUseCases }
      : {}),
    ...(deps.invoiceUseCasesByTenant
      ? { invoiceUseCasesByTenant: deps.invoiceUseCasesByTenant }
      : {}),
    ...(pool ? { postgresPool: pool } : {}),
  });


  const invoiceHandlers =
    deps.invoiceHandlers ?? createInvoiceHandlers(invoiceHandlerDeps);

  const webhookHandlers =
    deps.webhookHandlers ??
    createWebhookHandlers(
      createWebhookHandlerDeps({
        persistenceDriver,
        ...(deps.webhookHandlerDeps
          ? { webhookHandlerDeps: deps.webhookHandlerDeps }
          : {}),
        ...(pool ? { postgresPool: pool } : {}),
        ...(process.env.STRIPE_WEBHOOK_SECRET
          ? { stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET }
          : {}),
      }),
    );

  return {
    handleStartCheckout: createStartCheckoutHandler({ paymentProvider }),
    ...subscriptionHandlers,
    invoiceHandlers,
    webhookHandlers,
  };
}
