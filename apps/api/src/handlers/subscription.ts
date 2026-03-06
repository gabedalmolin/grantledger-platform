import { toApiErrorResponse } from "../http/errors.js";
import {
  BadRequestError,
  cancelSubscriptionAtPeriodEnd,
  cancelSubscriptionNow,
  createSubscription,
  downgradeSubscription,
  type SubscriptionUseCaseDeps,
  upgradeSubscription,
} from "@grantledger/application";

import type {
  CancelSubscriptionAtPeriodEndCommandInput,
  CancelSubscriptionNowCommandInput,
  CreateSubscriptionCommandInput,
  DowngradeSubscriptionCommandInput,
  UpgradeSubscriptionCommandInput,
} from "@grantledger/contracts";

import {
  upgradeSubscriptionCommandPayloadSchema,
  createSubscriptionCommandPayloadSchema,
  downgradeSubscriptionCommandPayloadSchema,
  cancelSubscriptionNowCommandPayloadSchema,
  cancelSubscriptionAtPeriodEndCommandPayloadSchema,
} from "@grantledger/contracts";

import { parseOrThrowBadRequest } from "../http/validation.js";
import { type Clock, type IdGenerator } from "@grantledger/shared";

import { getHeader } from "../http/headers.js";
import type { ApiResponse, Headers } from "../http/types.js";
import { resolveContextFromHeaders } from "./auth.js";

export interface SubscriptionHandlersDeps {
  subscriptionUseCases: SubscriptionUseCaseDeps;
  subscriptionUseCasesByTenant?: (tenantId: string) => SubscriptionUseCaseDeps;
  clock: Clock;
  idGenerator: IdGenerator;
}

function resolveSubscriptionUseCases(
  deps: SubscriptionHandlersDeps,
  tenantId: string,
): SubscriptionUseCaseDeps {
  return deps.subscriptionUseCasesByTenant
    ? deps.subscriptionUseCasesByTenant(tenantId)
    : deps.subscriptionUseCases;
}

function buildCommandContext(
  headers: Headers,
  reason: string,
  deps: Pick<SubscriptionHandlersDeps, "clock" | "idGenerator">,
) {
  const actorId = getHeader(headers, "x-user-id") ?? "system";
  const traceId = getHeader(headers, "x-trace-id") ?? deps.idGenerator.next();
  const idempotencyKey = getHeader(headers, "idempotency-key") ?? "";
  const requestedAt = deps.clock.nowIso();

  return {
    actor: { id: actorId, type: "user" as const },
    reason,
    traceId,
    idempotencyKey,
    requestedAt,
  };
}

export interface SubscriptionHandlers {
  handleCreateSubscriptionCommand(
    headers: Headers,
    payload: unknown,
  ): Promise<ApiResponse>;
  handleUpgradeSubscriptionCommand(
    headers: Headers,
    payload: unknown,
  ): Promise<ApiResponse>;
  handleDowngradeSubscriptionCommand(
    headers: Headers,
    payload: unknown,
  ): Promise<ApiResponse>;
  handleCancelSubscriptionNowCommand(
    headers: Headers,
    payload: unknown,
  ): Promise<ApiResponse>;
  handleCancelSubscriptionAtPeriodEndCommand(
    headers: Headers,
    payload: unknown,
  ): Promise<ApiResponse>;
}

export function createSubscriptionHandlers(
  deps: SubscriptionHandlersDeps,
): SubscriptionHandlers {
  return {
    async handleCreateSubscriptionCommand(
      headers: Headers,
      payload: unknown,
    ): Promise<ApiResponse> {
      try {
        const context = resolveContextFromHeaders(headers);
        const parsedPayload = parseOrThrowBadRequest(
          createSubscriptionCommandPayloadSchema,
          payload,
          "Invalid create subscription command payload",
        );

        if (parsedPayload.tenantId !== context.tenant.id) {
          throw new BadRequestError(
            "Payload tenantId must match authenticated tenant context",
          );
        }

        const subscriptionUseCases = resolveSubscriptionUseCases(
          deps,
          context.tenant.id,
        );

        const input: CreateSubscriptionCommandInput = {
          subscriptionId: parsedPayload.subscriptionId,
          tenantId: parsedPayload.tenantId,
          customerId: parsedPayload.customerId,
          planId: parsedPayload.planId,
          currentPeriod: {
            startsAt: parsedPayload.currentPeriodStart,
            endsAt: parsedPayload.currentPeriodEnd,
          },
          ...(parsedPayload.trialEndsAt !== undefined
            ? { trialEndsAt: parsedPayload.trialEndsAt }
            : {}),
          context: buildCommandContext(
            headers,
            parsedPayload.reason ?? "create subscription",
            deps,
          ),
        };

        const result = await createSubscription(subscriptionUseCases, input);
        return { status: 201, body: result };
      } catch (error) {
        return toApiErrorResponse(
          error,
          getHeader(headers, "x-trace-id") ?? undefined,
        );
      }
    },

    async handleUpgradeSubscriptionCommand(
      headers: Headers,
      payload: unknown,
    ): Promise<ApiResponse> {
      try {
        const context = resolveContextFromHeaders(headers);
        const parsedPayload = parseOrThrowBadRequest(
          upgradeSubscriptionCommandPayloadSchema,
          payload,
          "Invalid upgrade subscription command payload",
        );

        const subscriptionUseCases = resolveSubscriptionUseCases(
          deps,
          context.tenant.id,
        );

        const input: UpgradeSubscriptionCommandInput = {
          subscriptionId: parsedPayload.subscriptionId,
          nextPlanId: parsedPayload.nextPlanId,
          effectiveAt: parsedPayload.effectiveAt,
          context: buildCommandContext(
            headers,
            parsedPayload.reason ?? "upgrade subscription",
            deps,
          ),
        };

        const result = await upgradeSubscription(subscriptionUseCases, input);
        return { status: 200, body: result };
      } catch (error) {
        return toApiErrorResponse(
          error,
          getHeader(headers, "x-trace-id") ?? undefined,
        );
      }
    },

    async handleDowngradeSubscriptionCommand(
      headers: Headers,
      payload: unknown,
    ): Promise<ApiResponse> {
      try {
        const context = resolveContextFromHeaders(headers);
        const parsedPayload = parseOrThrowBadRequest(
          downgradeSubscriptionCommandPayloadSchema,
          payload,
          "Invalid downgrade subscription command payload",
        );

        const subscriptionUseCases = resolveSubscriptionUseCases(
          deps,
          context.tenant.id,
        );

        const input: DowngradeSubscriptionCommandInput = {
          subscriptionId: parsedPayload.subscriptionId,
          nextPlanId: parsedPayload.nextPlanId,
          effectiveAt: parsedPayload.effectiveAt,
          context: buildCommandContext(
            headers,
            parsedPayload.reason ?? "downgrade subscription",
            deps,
          ),
        };

        const result = await downgradeSubscription(subscriptionUseCases, input);
        return { status: 200, body: result };
      } catch (error) {
        return toApiErrorResponse(
          error,
          getHeader(headers, "x-trace-id") ?? undefined,
        );
      }
    },

    async handleCancelSubscriptionNowCommand(
      headers: Headers,
      payload: unknown,
    ): Promise<ApiResponse> {
      try {
        const context = resolveContextFromHeaders(headers);
        const parsedPayload = parseOrThrowBadRequest(
          cancelSubscriptionNowCommandPayloadSchema,
          payload,
          "Invalid cancel subscription now command payload",
        );

        const subscriptionUseCases = resolveSubscriptionUseCases(
          deps,
          context.tenant.id,
        );

        const input: CancelSubscriptionNowCommandInput = {
          subscriptionId: parsedPayload.subscriptionId,
          canceledAt: parsedPayload.canceledAt,
          context: buildCommandContext(
            headers,
            parsedPayload.reason ?? "cancel subscription now",
            deps,
          ),
        };

        const result = await cancelSubscriptionNow(subscriptionUseCases, input);
        return { status: 200, body: result };
      } catch (error) {
        return toApiErrorResponse(
          error,
          getHeader(headers, "x-trace-id") ?? undefined,
        );
      }
    },

    async handleCancelSubscriptionAtPeriodEndCommand(
      headers: Headers,
      payload: unknown,
    ): Promise<ApiResponse> {
      try {
        const context = resolveContextFromHeaders(headers);
        const parsedPayload = parseOrThrowBadRequest(
          cancelSubscriptionAtPeriodEndCommandPayloadSchema,
          payload,
          "Invalid cancel subscription at period end command payload",
        );

        const subscriptionUseCases = resolveSubscriptionUseCases(
          deps,
          context.tenant.id,
        );

        const input: CancelSubscriptionAtPeriodEndCommandInput = {
          subscriptionId: parsedPayload.subscriptionId,
          context: buildCommandContext(
            headers,
            parsedPayload.reason ?? "cancel subscription at period end",
            deps,
          ),
        };

        const result = await cancelSubscriptionAtPeriodEnd(subscriptionUseCases, input);
        return { status: 200, body: result };
      } catch (error) {
        return toApiErrorResponse(
          error,
          getHeader(headers, "x-trace-id") ?? undefined,
        );
      }
    },
  };
}
