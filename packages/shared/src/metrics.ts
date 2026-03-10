import { Registry, collectDefaultMetrics } from "prom-client";

import type { ServiceObservabilityContext } from "./observability.js";

function sanitiseMetricPrefix(service: string): string {
  const trimmed = service.trim().toLowerCase();
  let normalised = "";
  let previousWasSeparator = false;

  for (const character of trimmed) {
    const isAlphaNumeric =
      (character >= "a" && character <= "z") ||
      (character >= "0" && character <= "9");

    if (isAlphaNumeric) {
      normalised += character;
      previousWasSeparator = false;
      continue;
    }

    if (!previousWasSeparator && normalised.length > 0) {
      normalised += "_";
      previousWasSeparator = true;
    }
  }

  if (normalised.endsWith("_")) {
    normalised = normalised.slice(0, -1);
  }

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
