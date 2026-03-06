import { createInMemoryAsyncIdempotencyStore } from "@grantledger/application";
import { createPostgresWebhookAuditStore, createPostgresWebhookIdempotencyStore } from "@grantledger/infra-postgres";
import type { CanonicalPaymentEvent } from "@grantledger/contracts";
import type { Pool } from "pg";

import {
  StructuredLogCanonicalEventPublisher,
  StructuredLogWebhookAuditStore,
  type WebhookHandlerDeps,
} from "../handlers/webhook.js";

type PersistenceDriver = "memory" | "postgres";

export interface CreateWebhookHandlerDepsInput {
  webhookHandlerDeps?: WebhookHandlerDeps;
  persistenceDriver: PersistenceDriver;
  postgresPool?: Pool | null;
  stripeWebhookSecret?: string;
}

export function createWebhookHandlerDeps(
  input: CreateWebhookHandlerDepsInput,
): WebhookHandlerDeps {
  if (input.webhookHandlerDeps) {
    return input.webhookHandlerDeps;
  }

  const stripeWebhookSecret = input.stripeWebhookSecret?.trim();

  if (input.persistenceDriver === "postgres" && input.postgresPool) {
    return {
      idempotencyStore: createPostgresWebhookIdempotencyStore(
        input.postgresPool,
      ),
      auditStore: createPostgresWebhookAuditStore(input.postgresPool),
      eventPublisher: new StructuredLogCanonicalEventPublisher(),
      ...(stripeWebhookSecret ? { stripeWebhookSecret } : {}),
    };
  }

  return {
    idempotencyStore:
      createInMemoryAsyncIdempotencyStore<CanonicalPaymentEvent>(),
    auditStore: new StructuredLogWebhookAuditStore(),
    eventPublisher: new StructuredLogCanonicalEventPublisher(),
    ...(stripeWebhookSecret ? { stripeWebhookSecret } : {}),
  };
}