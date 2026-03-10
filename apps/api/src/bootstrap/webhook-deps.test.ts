import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

import {
  StructuredLogCanonicalEventPublisher,
  StructuredLogWebhookAuditStore,
  type WebhookHandlerDeps,
} from "../handlers/webhook.js";

const {
  createPostgresWebhookAuditStore,
  createPostgresWebhookIdempotencyStore,
} = vi.hoisted(() => ({
  createPostgresWebhookAuditStore: vi.fn(),
  createPostgresWebhookIdempotencyStore: vi.fn(),
}));

vi.mock("@grantledger/infra-postgres", () => ({
  createPostgresWebhookAuditStore,
  createPostgresWebhookIdempotencyStore,
}));

import { createWebhookHandlerDeps } from "./webhook-deps.js";

describe("createWebhookHandlerDeps", () => {
  beforeEach(() => {
    createPostgresWebhookAuditStore.mockReset();
    createPostgresWebhookIdempotencyStore.mockReset();
  });

  it("returns provided webhook handler deps unchanged", () => {
    const provided = {
      idempotencyStore: { marker: "idem" },
      auditStore: { marker: "audit" },
      eventPublisher: { marker: "publisher" },
    } as unknown as WebhookHandlerDeps;

    const result = createWebhookHandlerDeps({
      persistenceDriver: "memory",
      webhookHandlerDeps: provided,
    });

    expect(result).toBe(provided);
  });

  it("creates in-memory deps by default", () => {
    const result = createWebhookHandlerDeps({
      persistenceDriver: "memory",
    });

    expect(result.idempotencyStore).toBeDefined();
    expect(result.auditStore).toBeInstanceOf(StructuredLogWebhookAuditStore);
    expect(result.eventPublisher).toBeInstanceOf(
      StructuredLogCanonicalEventPublisher,
    );
    expect(result.stripeWebhookSecret).toBeUndefined();
  });

  it("trims and includes the stripe webhook secret when provided", () => {
    const result = createWebhookHandlerDeps({
      persistenceDriver: "memory",
      stripeWebhookSecret: "  whsec_test  ",
    });

    expect(result.stripeWebhookSecret).toBe("whsec_test");
  });

  it("creates Postgres-backed deps in postgres mode when a pool is provided", () => {
    const pool = {} as Pool;

    const postgresIdempotencyStore = {
      marker: "pg-idempotency",
    };

    const postgresAuditStore = {
      marker: "pg-audit",
    };

    createPostgresWebhookIdempotencyStore.mockReturnValue(
      postgresIdempotencyStore,
    );
    createPostgresWebhookAuditStore.mockReturnValue(postgresAuditStore);

    const result = createWebhookHandlerDeps({
      persistenceDriver: "postgres",
      postgresPool: pool,
    });

    expect(createPostgresWebhookIdempotencyStore).toHaveBeenCalledTimes(1);
    expect(createPostgresWebhookIdempotencyStore).toHaveBeenCalledWith(pool);

    expect(createPostgresWebhookAuditStore).toHaveBeenCalledTimes(1);
    expect(createPostgresWebhookAuditStore).toHaveBeenCalledWith(pool);

    expect(result.idempotencyStore).toBe(postgresIdempotencyStore);
    expect(result.auditStore).toBe(postgresAuditStore);
    expect(result.eventPublisher).toBeInstanceOf(
      StructuredLogCanonicalEventPublisher,
    );
  });
});
