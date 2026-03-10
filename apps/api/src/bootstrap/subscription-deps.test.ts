import { describe, expect, it } from "vitest";
import type {
  Subscription,
  SubscriptionAuditEvent,
  SubscriptionDomainEvent,
} from "@grantledger/contracts";

import { createInMemorySubscriptionUseCaseDeps } from "./subscription-deps.js";

describe("createInMemorySubscriptionUseCaseDeps", () => {
  it("returns the full in-memory dependency set", () => {
    const deps = createInMemorySubscriptionUseCaseDeps();

    expect(deps.repository).toBeDefined();
    expect(deps.idempotencyStore).toBeDefined();
    expect(deps.eventPublisher).toBeDefined();
    expect(deps.auditLogger).toBeDefined();
  });

  it("persists subscriptions in the in-memory repository", async () => {
    const deps = createInMemorySubscriptionUseCaseDeps();

    const created = {
      id: "sub_1",
      status: "trialing",
    } as unknown as Subscription;

    const updated = {
      id: "sub_1",
      status: "active",
    } as unknown as Subscription;

    await deps.repository.create(created);
    expect(await deps.repository.findById("sub_1")).toBe(created);

    await deps.repository.save(updated);
    expect(await deps.repository.findById("sub_1")).toBe(updated);
  });

  it("exposes event publisher and audit logger implementation that can be invoked", async () => {
    const deps = createInMemorySubscriptionUseCaseDeps();

    await expect(
      deps.eventPublisher.publish({} as SubscriptionDomainEvent),
    ).resolves.toBeUndefined();

    await expect(
      deps.auditLogger.log({} as SubscriptionAuditEvent),
    ).resolves.toBeUndefined();
  });
});