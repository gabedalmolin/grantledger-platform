import { Registry, collectDefaultMetrics } from "prom-client";

import type { ServiceObservabilityContext } from "./observability.js";

function sanitiseMetricPrefix(service: string): string {
  const normalised = service
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalised || "grantledger_service";
}

export interface CreateMetricsRegistryInput {
  context: ServiceObservabilityContext;
  collectDefaultMetrics?: boolean;
}

export function createMetricsRegistry(
  input: CreateMetricsRegistryInput,
): Registry {
  const registry = new Registry();

  registry.setDefaultLabels({
    service: input.context.service,
    runtime: input.context.runtime ?? "nodejs",
    environment: input.context.environment ?? "development",
    ...(input.context.version ? { version: input.context.version } : {}),
  });

  if (input.collectDefaultMetrics ?? true) {
    collectDefaultMetrics({
      register: registry,
      prefix: `${sanitiseMetricPrefix(input.context.service)}_`,
    });
  }

  return registry;
}
