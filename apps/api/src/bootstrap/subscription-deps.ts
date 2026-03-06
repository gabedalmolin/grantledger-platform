import {
  createInMemoryAsyncIdempotencyStore,
  type SubscriptionAuditLogger,
  type SubscriptionEventPublisher,
  type SubscriptionIdempotencyStore,
  type SubscriptionRepository,
  type SubscriptionUseCaseDeps,
} from "@grantledger/application";
import type {
  Subscription,
  SubscriptionAuditEvent,
  SubscriptionDomainEvent,
} from "@grantledger/contracts";
import { emitStructuredLog } from "@grantledger/shared";

class InMemorySubscriptionRepository implements SubscriptionRepository {
  private readonly store = new Map<string, Subscription>();

  async findById(subscriptionId: string): Promise<Subscription | null> {
    return this.store.get(subscriptionId) ?? null;
  }

  async create(subscription: Subscription): Promise<void> {
    this.store.set(subscription.id, subscription);
  }

  async save(subscription: Subscription): Promise<void> {
    this.store.set(subscription.id, subscription);
  }
}

class ConsoleSubscriptionEventPublisher implements SubscriptionEventPublisher {
  async publish(event: SubscriptionDomainEvent): Promise<void> {
    emitStructuredLog({
      type: "domain_event",
      payload: event as unknown as Record<string, unknown>,
    });
  }
}

class ConsoleSubscriptionAuditLogger implements SubscriptionAuditLogger {
  async log(event: SubscriptionAuditEvent): Promise<void> {
    emitStructuredLog({
      type: "audit_event",
      payload: event as unknown as Record<string, unknown>,
    });
  }
}

export function createInMemorySubscriptionUseCaseDeps(): SubscriptionUseCaseDeps {
  return {
    repository: new InMemorySubscriptionRepository(),
    idempotencyStore:
      createInMemoryAsyncIdempotencyStore<Subscription>() satisfies SubscriptionIdempotencyStore,
    eventPublisher: new ConsoleSubscriptionEventPublisher(),
    auditLogger: new ConsoleSubscriptionAuditLogger(),
  };
}
