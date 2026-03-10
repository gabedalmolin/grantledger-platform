import { utcNowIso } from "./time.js";

export type ObservabilityLevel = "debug" | "info" | "warn" | "error";

export interface ServiceObservabilityContext {
  service: string;
  runtime?: string;
  environment?: string;
  version?: string;
}

export interface StructuredLogInput {
  level?: ObservabilityLevel;
  type: string;
  traceId?: string;
  occurredAt?: string;
  payload?: Record<string, unknown>;
}

let defaultStructuredLogContext: Partial<ServiceObservabilityContext> = {};

const sinks: Record<ObservabilityLevel, (line: string) => void> = {
  debug: (line) => console.debug(line),
  info: (line) => console.log(line),
  warn: (line) => console.warn(line),
  error: (line) => console.error(line),
};

export function resolveServiceObservabilityContext(
  service: string,
  env: NodeJS.ProcessEnv = process.env,
): ServiceObservabilityContext {
  const environment = env.NODE_ENV?.trim() || "development";
  const version = env.GRANTLEDGER_VERSION?.trim() || undefined;

  return {
    service,
    runtime: "nodejs",
    environment,
    ...(version ? { version } : {}),
  };
}

export function configureStructuredLogging(
  context: Partial<ServiceObservabilityContext>,
): void {
  defaultStructuredLogContext = { ...context };
}

export function resetStructuredLoggingForTests(): void {
  defaultStructuredLogContext = {};
}

export function emitStructuredLog(input: StructuredLogInput): void {
  const {
    level = "info",
    type,
    traceId,
    occurredAt = utcNowIso(),
    payload = {},
  } = input;

  const event = {
    ...payload,
    level,
    type,
    occurredAt,
    ...defaultStructuredLogContext,
    ...(traceId !== undefined ? { traceId } : {}),
  };

  sinks[level](JSON.stringify(event));
}
