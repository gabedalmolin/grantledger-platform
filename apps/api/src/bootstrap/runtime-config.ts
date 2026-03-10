export type PersistenceDriver = "memory" | "postgres";

const DEFAULT_API_HOST = "0.0.0.0";
const DEFAULT_API_PORT = 3000;
const DEFAULT_API_JSON_BODY_LIMIT_BYTES = 1024 * 1024;

export interface ApiRuntimeConfig {
  persistenceDriver: PersistenceDriver;
  databaseUrl?: string;
  host: string;
  port: number;
  jsonBodyLimitBytes: number;
  stripeWebhookSecret?: string;
}

function parsePort(raw: string | undefined): number {
  if (!raw) {
    return DEFAULT_API_PORT;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0 || value > 65535) {
    throw new Error("API_PORT must be a valid TCP port number");
  }

  return value;
}

function parsePositiveInt(
  raw: string | undefined,
  envName: string,
  fallback: number,
): number {
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${envName} must be a positive integer`);
  }

  return value;
}

export function resolveApiRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): ApiRuntimeConfig {
  const rawDriver = env.PERSISTENCE_DRIVER?.trim();

  if (rawDriver && rawDriver !== "memory" && rawDriver !== "postgres") {
    throw new Error("PERSISTENCE_DRIVER must be either 'memory' or 'postgres'");
  }

  const persistenceDriver: PersistenceDriver =
    rawDriver === "postgres" ? "postgres" : "memory";
  const databaseUrl = env.DATABASE_URL?.trim() || undefined;

  if (persistenceDriver === "postgres") {
    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL is required when PERSISTENCE_DRIVER=postgres",
      );
    }
  }

  return {
    persistenceDriver,
    ...(databaseUrl ? { databaseUrl } : {}),
    host: env.API_HOST?.trim() || DEFAULT_API_HOST,
    port: parsePort(env.API_PORT),
    jsonBodyLimitBytes: parsePositiveInt(
      env.API_JSON_BODY_LIMIT_BYTES,
      "API_JSON_BODY_LIMIT_BYTES",
      DEFAULT_API_JSON_BODY_LIMIT_BYTES,
    ),
    ...(env.STRIPE_WEBHOOK_SECRET?.trim()
      ? { stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET.trim() }
      : {}),
  };
}

export function validateApiRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): void {
  resolveApiRuntimeConfig(env);
}
