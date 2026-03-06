import {
  BadRequestError,
  InvalidWebhookSignatureError,
  processProviderWebhook,
  type AsyncIdempotencyStore,
  type CanonicalPaymentEventPublisher,
  type PaymentWebhookProvider,
  type WebhookAuditStore,
} from "@grantledger/application";
import {
  paymentWebhookEnvelopeSchema,
  type CanonicalPaymentEvent,
  type PaymentProviderName,
} from "@grantledger/contracts";
import { emitStructuredLog } from "@grantledger/shared";

import { StripeWebhookProvider } from "../infrastructure/stripe/StripeWebhookProvider.js";
import { toApiErrorResponse } from "../http/errors.js";
import { getHeader } from "../http/headers.js";
import type { ApiResponse, Headers } from "../http/types.js";
import { parseOrThrowBadRequest } from "../http/validation.js";

export class StructuredLogWebhookAuditStore implements WebhookAuditStore {
  async saveRaw(input: {
    provider: PaymentProviderName;
    traceId: string;
    rawBody: string;
    headers: Record<string, string | undefined>;
    receivedAt: string;
    eventId?: string;
    status: "processed" | "duplicate" | "rejected";
    reason?: string;
  }): Promise<void> {
    emitStructuredLog({
      type: "payment_webhook_audit",
      payload: input as unknown as Record<string, unknown>,
    });
  }
}

export class StructuredLogCanonicalEventPublisher
  implements CanonicalPaymentEventPublisher {
  async publish(event: {
    provider: PaymentProviderName;
    eventId: string;
    type: string;
    domainEventVersion: "v1";
    occurredAt: string;
    traceId: string;
    payload: Record<string, string>;
    tenantId?: string;
    subscriptionId?: string;
  }): Promise<void> {
    emitStructuredLog({
      type: "canonical_payment_event",
      payload: event as unknown as Record<string, unknown>,
    });
  }
}

export interface WebhookHandlerDeps {
  idempotencyStore: AsyncIdempotencyStore<CanonicalPaymentEvent>;
  auditStore: WebhookAuditStore;
  eventPublisher: CanonicalPaymentEventPublisher;
  providerRegistry?: Partial<Record<PaymentProviderName, PaymentWebhookProvider>>;
  stripeWebhookSecret?: string;
}

export interface WebhookHandlers {
  handleProviderWebhook(
    headers: Headers,
    payload: unknown,
  ): Promise<ApiResponse>;
}

export function createWebhookHandlers(
  deps: WebhookHandlerDeps,
): WebhookHandlers {
  return {
    handleProviderWebhook: (headers, payload) =>
      handleProviderWebhook(headers, payload, deps),
  };
}

function resolveProvider(
  providerName: PaymentProviderName,
  deps: WebhookHandlerDeps,
): PaymentWebhookProvider {
  const registered = deps.providerRegistry?.[providerName];
  if (registered) {
    return registered;
  }

  if (providerName === "stripe") {
    const secret = (
      deps.stripeWebhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET
    )?.trim();
    if (!secret) {
      throw new Error(
        "STRIPE_WEBHOOK_SECRET is required to process Stripe webhooks",
      );
    }
    return new StripeWebhookProvider(secret);
  }

  throw new BadRequestError(`Unsupported webhook provider: ${providerName}`);
}

function mapWebhookError(error: unknown): unknown {
  if (error instanceof InvalidWebhookSignatureError) {
    return new BadRequestError("Invalid webhook signature");
  }
  return error;
}

function traceIdFromHeaders(headers: Headers): string | undefined {
  return getHeader(headers, "x-trace-id") ?? undefined;
}

export async function handleProviderWebhook(
  headers: Headers,
  payload: unknown,
  deps: WebhookHandlerDeps,
): Promise<ApiResponse> {
  try {
    const parsedPayload = parseOrThrowBadRequest(
      paymentWebhookEnvelopeSchema,
      payload,
      "Invalid payment webhook payload",
    );

    const provider = resolveProvider(parsedPayload.provider, deps);

    const result = await processProviderWebhook(
      {
        provider,
        idempotencyStore: deps.idempotencyStore,
        auditStore: deps.auditStore,
        eventPublisher: deps.eventPublisher,
      },
      parsedPayload,
    );

    return {
      status: 200,
      body: result,
    };
  } catch (error) {
    return toApiErrorResponse(mapWebhookError(error), traceIdFromHeaders(headers));
  }
}
