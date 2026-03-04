export type PersistenceDriver = "memory" | "postgres";

export interface ApiRuntimeConfig {
  persistenceDriver: PersistenceDriver;
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

  if (persistenceDriver === "postgres") {
    const databaseUrl = env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL is required when PERSISTENCE_DRIVER=postgres",
      );
    }
  }

  return { persistenceDriver };
}

export function validateApiRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): void {
  resolveApiRuntimeConfig(env);
}
