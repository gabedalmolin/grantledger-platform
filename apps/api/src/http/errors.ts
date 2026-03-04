import { AppError, type AppErrorCode } from "@grantledger/application";
import { SubscriptionDomainError } from "@grantledger/domain";
import { buildStandardErrorBody, t } from "@grantledger/shared";

import type { ApiResponse } from "./types.js";

export interface ApiErrorResponseBody {
  message: string;
  code: string;
  messageKey?: string;
  messageParams?: Record<string, unknown>;
  details?: unknown;
  traceId?: string;
}

const appErrorCodeToMessageKey: Record<AppErrorCode, string> = {
  AUTHENTICATION_REQUIRED: "error.auth.authentication_required",
  FORBIDDEN: "error.auth.forbidden",
  BAD_REQUEST: "error.bad_request",
  VALIDATION_ERROR: "error.validation_failed",
  NOT_FOUND: "error.not_found",
  CONFLICT: "error.conflict",
  IDEMPOTENCY_CONFLICT: "error.idempotency.conflict",
  IDEMPOTENCY_IN_PROGRESS: "error.idempotency.in_progress",
  MISSING_IDEMPOTENCY_KEY: "error.idempotency.missing_key",
  DOMAIN_CONFLICT: "error.domain_conflict",
  INTERNAL_ERROR: "error.internal",
};

export function toApiErrorResponse(
  error: unknown,
  traceId?: string,
  locale?: string,
): ApiResponse {
  if (error instanceof AppError) {
    const messageKey = error.messageKey ?? appErrorCodeToMessageKey[error.code];
    return {
      status: error.httpStatus,
      body: buildStandardErrorBody({
        message: error.message,
        code: error.code,
        ...(messageKey !== undefined ? { messageKey } : {}),
        ...(error.messageParams !== undefined
          ? { messageParams: error.messageParams }
          : {}),
        ...(error.details !== undefined ? { details: error.details } : {}),
        ...(traceId !== undefined ? { traceId } : {}),
      }),
    };
  }

  if (error instanceof SubscriptionDomainError) {
    return {
      status: 409,
      body: buildStandardErrorBody({
        message: error.message,
        code: "DOMAIN_CONFLICT",
        messageKey: "error.domain_conflict",
        ...(traceId !== undefined ? { traceId } : {}),
      }),
    };
  }

  return {
    status: 500,
    body: buildStandardErrorBody({
      message: t("error.unexpected", locale ? { locale } : undefined),
      code: "INTERNAL_ERROR",
      messageKey: "error.unexpected",
      ...(traceId !== undefined ? { traceId } : {}),
    }),
  };
}
