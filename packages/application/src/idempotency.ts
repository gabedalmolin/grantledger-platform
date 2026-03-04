import type { IdempotencyRecord } from "@grantledger/contracts";
import {
  hashPayload,
  type FingerprintFn,
  utcNowIso,
} from "@grantledger/shared";
import { AppError } from "./errors.js";

export class MissingIdempotencyKeyError extends AppError {
  constructor(message = "Idempotency-Key is required") {
    super({
      message,
      code: "MISSING_IDEMPOTENCY_KEY",
      httpStatus: 400,
      messageKey: "error.idempotency.missing_key",
    });
  }
}

export class IdempotencyConflictError extends AppError {
  constructor(message = "Idempotency key reuse with different payload") {
    super({
      message,
      code: "IDEMPOTENCY_CONFLICT",
      httpStatus: 409,
      messageKey: "error.idempotency.conflict",
    });
  }
}

export class IdempotencyInProgressError extends AppError {
  constructor(message = "Idempotent request is already processing") {
    super({
      message,
      code: "IDEMPOTENCY_IN_PROGRESS",
      httpStatus: 409,
      messageKey: "error.idempotency.in_progress",
    });
  }
}

export type IdempotencyBeginOutcome<TResponse> =
  | { outcome: "started" }
  | { outcome: "replay"; record: IdempotencyRecord<TResponse> }
  | { outcome: "conflict" }
  | { outcome: "in_progress" };

export interface AsyncIdempotencyStore<TResponse> {
  get(scope: string, key: string): Promise<IdempotencyRecord<TResponse> | null>;
  set(
    scope: string,
    key: string,
    record: IdempotencyRecord<TResponse>,
  ): Promise<void>;
  begin?(
    scope: string,
    key: string,
    payloadHash: string,
    startedAt: string,
  ): Promise<IdempotencyBeginOutcome<TResponse>>;
}

export interface ExecuteIdempotentInput<TPayload, TResponse> {
  scope: string;
  key: string | null;
  payload?: TPayload;
  fingerprint?: FingerprintFn<TPayload>;
  store: AsyncIdempotencyStore<TResponse>;
  execute: () => Promise<TResponse>;
  now?: () => string;
}

export interface ProcessWithIdempotencyInput<TPayload, TResponse> {
  key: string | null;
  payload: TPayload;
  fingerprint?: FingerprintFn<TPayload>;
  store: Map<string, IdempotencyRecord<TResponse>>;
  execute: () => TResponse;
  now?: () => string;
}

export interface ProcessWithIdempotencyResult<TResponse> {
  response: TResponse;
  replayed: boolean;
}

function requireIdempotencyKey(key: string | null): string {
  if (!key || key.trim().length === 0) {
    throw new MissingIdempotencyKeyError();
  }
  return key;
}

function resolvePayloadHash<TPayload>(
  payload: TPayload | undefined,
  fingerprint?: FingerprintFn<TPayload>,
): string {
  if (fingerprint) {
    return fingerprint(payload);
  }
  return hashPayload(payload ?? null);
}

function buildProcessingRecord<TResponse>(
  key: string,
  payloadHash: string,
  createdAt: string,
): IdempotencyRecord<TResponse> {
  return {
    key,
    payloadHash,
    status: "processing",
    createdAt,
    updatedAt: createdAt,
  };
}

function ensureReplayResponse<TResponse>(
  record: IdempotencyRecord<TResponse>,
): TResponse {
  if (record.response === undefined) {
    throw new AppError({
      message: "Stored idempotency replay record has no response payload",
      code: "INTERNAL_ERROR",
      httpStatus: 500,
      messageKey: "error.internal",
    });
  }
  return record.response;
}

async function beginWithFallback<TResponse>(
  store: AsyncIdempotencyStore<TResponse>,
  scope: string,
  key: string,
  payloadHash: string,
  now: string,
): Promise<IdempotencyBeginOutcome<TResponse>> {
  const existingRecord = await store.get(scope, key);

  if (!existingRecord) {
    await store.set(scope, key, buildProcessingRecord(key, payloadHash, now));
    return { outcome: "started" };
  }

  if (existingRecord.payloadHash !== payloadHash) {
    return { outcome: "conflict" };
  }

  if (existingRecord.status === "completed") {
    return { outcome: "replay", record: existingRecord };
  }

  if (existingRecord.status === "processing") {
    return { outcome: "in_progress" };
  }

  await store.set(scope, key, {
    ...buildProcessingRecord<TResponse>(
      key,
      payloadHash,
      existingRecord.createdAt,
    ),
    updatedAt: now,
  });
  return { outcome: "started" };
}

async function beginExecution<TResponse>(
  store: AsyncIdempotencyStore<TResponse>,
  scope: string,
  key: string,
  payloadHash: string,
  now: string,
): Promise<IdempotencyBeginOutcome<TResponse>> {
  if (store.begin) {
    return store.begin(scope, key, payloadHash, now);
  }
  return beginWithFallback(store, scope, key, payloadHash, now);
}

export async function executeIdempotent<TPayload, TResponse>(
  input: ExecuteIdempotentInput<TPayload, TResponse>,
): Promise<ProcessWithIdempotencyResult<TResponse>> {
  const key = requireIdempotencyKey(input.key);
  const now = (input.now ?? utcNowIso)();
  const payloadHash = resolvePayloadHash(input.payload, input.fingerprint);

  const beginOutcome = await beginExecution(
    input.store,
    input.scope,
    key,
    payloadHash,
    now,
  );

  if (beginOutcome.outcome === "conflict") {
    throw new IdempotencyConflictError();
  }

  if (beginOutcome.outcome === "in_progress") {
    throw new IdempotencyInProgressError();
  }

  if (beginOutcome.outcome === "replay") {
    return {
      response: ensureReplayResponse(beginOutcome.record),
      replayed: true,
    };
  }

  try {
    const response = await input.execute();
    const completedAt = (input.now ?? utcNowIso)();

    await input.store.set(input.scope, key, {
      key,
      payloadHash,
      status: "completed",
      response,
      createdAt: now,
      updatedAt: completedAt,
    });

    return {
      response,
      replayed: false,
    };
  } catch (error) {
    const failedAt = (input.now ?? utcNowIso)();
    const errorMessage =
      error instanceof Error ? error.message : "Unexpected execution failure";

    await input.store.set(input.scope, key, {
      key,
      payloadHash,
      status: "failed",
      createdAt: now,
      updatedAt: failedAt,
      errorMessage,
    });

    throw error;
  }
}

export function processWithIdempotency<TPayload, TResponse>(
  input: ProcessWithIdempotencyInput<TPayload, TResponse>,
): ProcessWithIdempotencyResult<TResponse> {
  const key = requireIdempotencyKey(input.key);
  const now = (input.now ?? utcNowIso)();
  const payloadHash = resolvePayloadHash(input.payload, input.fingerprint);
  const existingRecord = input.store.get(key);

  if (existingRecord) {
    if (existingRecord.payloadHash !== payloadHash) {
      throw new IdempotencyConflictError();
    }
    if (existingRecord.status === "processing") {
      throw new IdempotencyInProgressError();
    }
    if (existingRecord.status === "completed") {
      return {
        response: ensureReplayResponse(existingRecord),
        replayed: true,
      };
    }
  }

  input.store.set(key, buildProcessingRecord(key, payloadHash, now));

  try {
    const response = input.execute();
    const completedAt = (input.now ?? utcNowIso)();

    input.store.set(key, {
      key,
      payloadHash,
      status: "completed",
      response,
      createdAt: now,
      updatedAt: completedAt,
    });

    return {
      response,
      replayed: false,
    };
  } catch (error) {
    const failedAt = (input.now ?? utcNowIso)();
    const errorMessage =
      error instanceof Error ? error.message : "Unexpected execution failure";

    input.store.set(key, {
      key,
      payloadHash,
      status: "failed",
      createdAt: now,
      updatedAt: failedAt,
      errorMessage,
    });

    throw error;
  }
}

export function createInMemoryAsyncIdempotencyStore<
  TResponse,
>(): AsyncIdempotencyStore<TResponse> {
  const store = new Map<string, IdempotencyRecord<TResponse>>();

  return {
    async get(
      scope: string,
      key: string,
    ): Promise<IdempotencyRecord<TResponse> | null> {
      return store.get(`${scope}:${key}`) ?? null;
    },
    async set(
      scope: string,
      key: string,
      record: IdempotencyRecord<TResponse>,
    ): Promise<void> {
      store.set(`${scope}:${key}`, record);
    },
    async begin(
      scope: string,
      key: string,
      payloadHash: string,
      startedAt: string,
    ): Promise<IdempotencyBeginOutcome<TResponse>> {
      const mapKey = `${scope}:${key}`;
      const existingRecord = store.get(mapKey);

      if (!existingRecord) {
        store.set(mapKey, buildProcessingRecord(key, payloadHash, startedAt));
        return { outcome: "started" };
      }

      if (existingRecord.payloadHash !== payloadHash) {
        return { outcome: "conflict" };
      }

      if (existingRecord.status === "processing") {
        return { outcome: "in_progress" };
      }

      if (existingRecord.status === "completed") {
        return { outcome: "replay", record: existingRecord };
      }

      store.set(mapKey, {
        ...buildProcessingRecord(key, payloadHash, existingRecord.createdAt),
        updatedAt: startedAt,
      });
      return { outcome: "started" };
    },
  };
}
