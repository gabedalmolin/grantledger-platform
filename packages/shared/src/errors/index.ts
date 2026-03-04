export interface StandardErrorBody {
  message: string;
  code: string;
  messageKey?: string;
  messageParams?: Record<string, unknown>;
  details?: unknown;
  traceId?: string;
}

export interface BuildErrorBodyInput {
  message: string;
  code: string;
  messageKey?: string;
  messageParams?: Record<string, unknown>;
  details?: unknown;
  traceId?: string;
}

export function buildStandardErrorBody(
  input: BuildErrorBodyInput,
): StandardErrorBody {
  return {
    message: input.message,
    code: input.code,
    ...(input.messageKey !== undefined ? { messageKey: input.messageKey } : {}),
    ...(input.messageParams !== undefined
      ? { messageParams: input.messageParams }
      : {}),
    ...(input.details !== undefined ? { details: input.details } : {}),
    ...(input.traceId !== undefined ? { traceId: input.traceId } : {}),
  };
}
