import { Counter, Gauge, Histogram, type Registry } from "prom-client";
import {
  createMetricsRegistry,
  resolveServiceObservabilityContext,
} from "@grantledger/shared";

export interface ApiMetrics {
  registry: Registry;
  healthState: Gauge;
  readinessState: Gauge;
  requestCounter: Counter<"route" | "method" | "status">;
  requestDuration: Histogram<"route" | "method" | "status">;
  errorCounter: Counter<"route" | "method" | "status">;
}

export interface RecordApiRequestMetricInput {
  route: string;
  method: string;
  status: number;
  durationSeconds: number;
}

let sharedApiMetrics: ApiMetrics | undefined;

export function createApiMetrics(env: NodeJS.ProcessEnv = process.env): ApiMetrics {
  const registry = createMetricsRegistry({
    context: resolveServiceObservabilityContext("api", env),
  });

  const healthState = new Gauge({
    name: "grantledger_api_health_state",
    help: "Health state for the API runtime.",
    registers: [registry],
  });

  const readinessState = new Gauge({
    name: "grantledger_api_readiness_state",
    help: "Readiness state for the API runtime.",
    registers: [registry],
  });

  const requestCounter = new Counter({
    name: "grantledger_api_http_requests_total",
    help: "Total HTTP requests handled by the API runtime.",
    labelNames: ["route", "method", "status"] as const,
    registers: [registry],
  });

  const requestDuration = new Histogram({
    name: "grantledger_api_http_request_duration_seconds",
    help: "HTTP request duration for the API runtime.",
    labelNames: ["route", "method", "status"] as const,
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [registry],
  });

  const errorCounter = new Counter({
    name: "grantledger_api_http_errors_total",
    help: "HTTP error responses returned by the API runtime.",
    labelNames: ["route", "method", "status"] as const,
    registers: [registry],
  });

  healthState.set(1);
  readinessState.set(0);

  return {
    registry,
    healthState,
    readinessState,
    requestCounter,
    requestDuration,
    errorCounter,
  };
}

export function getApiMetrics(
  env: NodeJS.ProcessEnv = process.env,
): ApiMetrics {
  if (!sharedApiMetrics) {
    sharedApiMetrics = createApiMetrics(env);
  }

  return sharedApiMetrics;
}

export function resetApiMetricsForTests(): void {
  sharedApiMetrics = undefined;
}

export function recordApiRequestMetric(
  metrics: ApiMetrics,
  input: RecordApiRequestMetricInput,
): void {
  const labels = {
    route: input.route,
    method: input.method,
    status: String(input.status),
  };

  metrics.requestCounter.inc(labels);
  metrics.requestDuration.observe(labels, input.durationSeconds);

  if (input.status >= 400) {
    metrics.errorCounter.inc(labels);
  }
}
