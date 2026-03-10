import { pathToFileURL } from "node:url";
import {
  DEFAULT_DEMO_SCENARIO,
  DEFAULT_DEMO_DATABASE_URL,
  seedDemoScenario,
  type DemoScenario,
} from "./demo-seed.ts";

export interface DemoRuntimeConfig {
  apiBaseUrl: string;
  workerMetricsUrl: string;
  prometheusUrl: string;
  grafanaUrl: string;
  databaseUrl: string;
  requestTimeoutMs: number;
  pollIntervalMs: number;
  maxPollAttempts: number;
  scenario: DemoScenario;
}

interface ApiErrorBody {
  message?: string;
}

export function resolveDemoRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): DemoRuntimeConfig {
  return {
    apiBaseUrl: env.DEMO_API_BASE_URL?.trim() || "http://127.0.0.1:13000",
    workerMetricsUrl:
      env.DEMO_WORKER_METRICS_URL?.trim() || "http://127.0.0.1:19464",
    prometheusUrl:
      env.DEMO_PROMETHEUS_URL?.trim() || "http://127.0.0.1:19090",
    grafanaUrl: env.DEMO_GRAFANA_URL?.trim() || "http://127.0.0.1:13001",
    databaseUrl:
      env.DEMO_DATABASE_URL?.trim() ||
      env.DATABASE_URL?.trim() ||
      DEFAULT_DEMO_DATABASE_URL,
    requestTimeoutMs: Number(env.DEMO_REQUEST_TIMEOUT_MS ?? 10_000),
    pollIntervalMs: Number(env.DEMO_POLL_INTERVAL_MS ?? 1_000),
    maxPollAttempts: Number(env.DEMO_MAX_POLL_ATTEMPTS ?? 30),
    scenario: DEFAULT_DEMO_SCENARIO,
  };
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ status: number; body: T }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = (await response.json()) as T;

    if (!response.ok) {
      const message =
        typeof body === "object" && body !== null && "message" in body
          ? String((body as ApiErrorBody).message ?? `HTTP ${response.status}`)
          : `HTTP ${response.status}`;
      throw new Error(`Request to ${url} failed: ${message}`);
    }

    return { status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(
  url: string,
  timeoutMs: number,
): Promise<{ status: number; body: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const body = await response.text();

    if (!response.ok) {
      throw new Error(`Request to ${url} failed with status ${response.status}`);
    }

    return { status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureRuntimeReady(config: DemoRuntimeConfig): Promise<void> {
  await fetchJson<{ status: string }>(
    `${config.apiBaseUrl}/readyz`,
    { method: "GET" },
    config.requestTimeoutMs,
  );

  await fetchText(`${config.workerMetricsUrl}/healthz`, config.requestTimeoutMs);
}

function buildEnqueuePayload(config: DemoRuntimeConfig) {
  const runId = new Date().toISOString().replace(/[.:]/g, "-");

  return {
    payload: {
      tenantId: config.scenario.tenantId,
      subscriptionId: config.scenario.subscriptionId,
      customerId: config.scenario.customerId,
      planId: config.scenario.planId,
      planVersionId: config.scenario.planVersionId,
      priceAmountInCents: config.scenario.priceAmountInCents,
      currency: config.scenario.currency,
      periodStart: config.scenario.periodStart,
      periodEnd: config.scenario.periodEnd,
      calculationVersion: `demo-run-${runId}`,
      traceId: `demo-trace-${runId}`,
    },
    idempotencyKey: `demo-enqueue-${runId}`,
  };
}

function buildDemoHeaders(
  config: DemoRuntimeConfig,
  idempotencyKey?: string,
): HeadersInit {
  return {
    "content-type": "application/json",
    "x-user-id": config.scenario.userId,
    "x-tenant-id": config.scenario.tenantId,
    ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
  };
}

async function enqueueInvoiceGeneration(config: DemoRuntimeConfig): Promise<string> {
  const request = buildEnqueuePayload(config);

  const response = await fetchJson<{ jobId: string; status: string }>(
    `${config.apiBaseUrl}/v1/invoices/generation`,
    {
      method: "POST",
      headers: buildDemoHeaders(config, request.idempotencyKey),
      body: JSON.stringify(request.payload),
    },
    config.requestTimeoutMs,
  );

  console.log(`Invoice generation enqueued with job ${response.body.jobId}.`);
  return response.body.jobId;
}

async function pollJobUntilCompleted(
  config: DemoRuntimeConfig,
  jobId: string,
): Promise<{ jobId: string; status: string; invoiceId?: string; reason?: string }> {
  for (let attempt = 1; attempt <= config.maxPollAttempts; attempt += 1) {
    const response = await fetchJson<{
      jobId: string;
      status: string;
      invoiceId?: string;
      reason?: string;
    }>(
      `${config.apiBaseUrl}/v1/invoices/generation/status`,
      {
        method: "POST",
        headers: buildDemoHeaders(config),
        body: JSON.stringify({ jobId }),
      },
      config.requestTimeoutMs,
    );

    console.log(
      `Poll ${attempt}/${config.maxPollAttempts}: job ${response.body.jobId} is ${response.body.status}.`,
    );

    if (response.body.status === "completed") {
      return response.body;
    }

    if (response.body.status === "failed") {
      throw new Error(
        `Demo job ${response.body.jobId} failed: ${response.body.reason ?? "unknown reason"}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  }

  throw new Error(
    `Demo job ${jobId} did not complete within the configured timeout`,
  );
}

async function verifyMetrics(config: DemoRuntimeConfig): Promise<void> {
  const apiMetrics = await fetchText(
    `${config.apiBaseUrl}/metrics`,
    config.requestTimeoutMs,
  );
  const workerMetrics = await fetchText(
    `${config.workerMetricsUrl}/metrics`,
    config.requestTimeoutMs,
  );
  const prometheusReady = await fetchText(
    `${config.prometheusUrl}/-/ready`,
    config.requestTimeoutMs,
  );

  if (!apiMetrics.body.includes("grantledger_api_http_requests_total")) {
    throw new Error(
      "API metrics output is missing grantledger_api_http_requests_total",
    );
  }

  if (!apiMetrics.body.includes('route="/v1/invoices/generation/status"')) {
    throw new Error(
      "API metrics output does not include the invoice status route labels",
    );
  }

  if (!workerMetrics.body.includes("grantledger_worker_cycles_total")) {
    throw new Error(
      "Worker metrics output is missing grantledger_worker_cycles_total",
    );
  }

  if (!workerMetrics.body.includes("grantledger_invoice_completed_count")) {
    throw new Error(
      "Worker metrics output is missing grantledger_invoice_completed_count",
    );
  }

  if (!prometheusReady.body.includes("Prometheus Server is Ready.")) {
    throw new Error(
      "Prometheus readiness endpoint did not return the expected response",
    );
  }
}

function printDemoSummary(
  config: DemoRuntimeConfig,
  result: { jobId: string; status: string; invoiceId?: string },
): void {
  console.log("GrantLedger self-hosted demo completed successfully.");
  console.log(`- tenantId: ${config.scenario.tenantId}`);
  console.log(`- subscriptionId: ${config.scenario.subscriptionId}`);
  console.log(`- jobId: ${result.jobId}`);
  console.log(`- finalStatus: ${result.status}`);
  if (result.invoiceId) {
    console.log(`- invoiceId: ${result.invoiceId}`);
  }
  console.log(`- API metrics: ${config.apiBaseUrl}/metrics`);
  console.log(`- Worker metrics: ${config.workerMetricsUrl}/metrics`);
  console.log(`- Prometheus: ${config.prometheusUrl}`);
  console.log(`- Grafana: ${config.grafanaUrl}`);
}

export async function runSelfHostedDemo(
  config: DemoRuntimeConfig = resolveDemoRuntimeConfig(),
): Promise<void> {
  console.log("Checking self-hosted runtime readiness...");
  await ensureRuntimeReady(config);

  console.log("Seeding the demo scenario...");
  const seedResult = await seedDemoScenario({
    databaseUrl: config.databaseUrl,
    scenario: config.scenario,
  });
  console.log(
    `Demo seed ${seedResult.created ? "created the subscription state" : "found the existing subscription state"}.`,
  );

  console.log("Triggering invoice generation through the API...");
  const jobId = await enqueueInvoiceGeneration(config);

  console.log("Polling invoice generation status...");
  const result = await pollJobUntilCompleted(config, jobId);

  console.log("Verifying runtime metrics...");
  await verifyMetrics(config);

  printDemoSummary(config, result);
}

async function runAsMain(): Promise<void> {
  await runSelfHostedDemo();
}

function isMainModule(moduleUrl: string): boolean {
  const entry = process.argv[1];
  return entry ? pathToFileURL(entry).href === moduleUrl : false;
}

if (isMainModule(import.meta.url)) {
  void runAsMain().catch((error) => {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown demo walkthrough error";
    console.error(`GrantLedger self-hosted demo failed: ${message}`);
    process.exitCode = 1;
  });
}
