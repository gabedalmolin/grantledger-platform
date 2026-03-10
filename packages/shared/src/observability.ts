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

const REDACTED_VALUE = "[REDACTED]";

const sinks: Record<ObservabilityLevel, (line: string) => void> = {
  debug: (line) => console.debug(line),
  info: (line) => console.log(line),
  warn: (line) => console.warn(line),
  error: (line) => console.error(line),
};

function normaliseSecurityKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalised = normaliseSecurityKey(key);

  return (
    normalised.includes("password") ||
    normalised.includes("secret") ||
    normalised.includes("authorization") ||
    normalised.includes("apikey") ||
    normalised.includes("accesskey") ||
    normalised.includes("connectionstring") ||
    normalised.includes("databaseurl") ||
    normalised === "token" ||
    normalised.endsWith("token") ||
    normalised === "dsn" ||
    normalised.endsWith("dsn")
  );
}

function sanitiseLogValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitiseLogValue(item));
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      isSensitiveKey(key) ? REDACTED_VALUE : sanitiseLogValue(nestedValue),
    ]),
  );
}

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
    ...(sanitiseLogValue(payload) as Record<string, unknown>),
    level,
    type,
    occurredAt,
    ...defaultStructuredLogContext,
    ...(traceId !== undefined ? { traceId } : {}),
  };

  sinks[level](JSON.stringify(event));
}
