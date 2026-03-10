import { describe, expect, it } from "vitest";
import type { Subscription } from "@grantledger/contracts";

import {
  InvalidSubscriptionTransitionError,
  SubscriptionDomainError,
  applyUpgrade,
  assertTransitionAllowed,
} from "./subscription.js";

function buildSubscription(
  overrides: Partial<Subscription> = {},
): Subscription {
  return {
    id: "sub_1",
    tenantId: "tenant_1",
    customerId: "customer_1",
    planId: "plan_basic",
    status: "active",
    currentPeriod: {
      startsAt: "2026-03-01T00:00:00.000Z",
      endsAt: "2026-03-31T23:59:59.000Z",
    },
    cancelAtPeriodEnd: false,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("subscription domain invariants", () => {
  it("rejects invalid status transitions", () => {
    expect(() => assertTransitionAllowed("canceled", "active")).toThrow(
      InvalidSubscriptionTransitionError,
    );
  });

  it("rejects upgrades outside the current billing period", () => {
    const current = buildSubscription();

    expect(() =>
      applyUpgrade(current, "plan_pro", "2026-04-01T00:00:00.000Z"),
    ).toThrow(SubscriptionDomainError);

    expect(() =>
      applyUpgrade(current, "plan_pro", "2026-04-01T00:00:00.000Z"),
    ).toThrow("effectiveAt must be within current billing period");
  });
});
