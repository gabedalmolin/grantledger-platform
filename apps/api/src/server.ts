import {
  createServer,
  type IncomingHttpHeaders,
  type RequestListener,
  type Server,
} from "node:http";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import {
  BadRequestError,
  NotFoundError,
} from "@grantledger/application";
import { createPostgresPool } from "@grantledger/infra-postgres";
import {
  buildStandardErrorBody,
  configureStructuredLogging,
  emitStructuredLog,
  resolveServiceObservabilityContext,
} from "@grantledger/shared";
import type { Pool } from "pg";

import { createApiCompositionRoot } from "./bootstrap/composition-root.js";
import { resolveApiRuntimeConfig } from "./bootstrap/runtime-config.js";
import { handleCreateSubscription } from "./handlers/auth.js";
import { toApiErrorResponse } from "./http/errors.js";
import { getHeader } from "./http/headers.js";
import type { ApiResponse, Headers } from "./http/types.js";
import {
  getApiMetrics,
  recordApiRequestMetric,
  type ApiMetrics,
} from "./metrics.js";

const DEFAULT_API_RESPONSE_HEADERS = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

class PayloadTooLargeError extends Error {
  constructor(message = "Request body exceeds configured limit") {
    super(message);
    this.name = "PayloadTooLargeError";
  }
}

type ApiRouteHandler = (
  headers: Headers,
  payload: unknown,
) => Promise<ApiResponse> | ApiResponse;

export interface ApiServerConfig {
  host: string;
  port: number;
  jsonBodyLimitBytes: number;
}

export interface ApiRequestListenerDeps {
  handleCreateSubscription: ApiRouteHandler;
  handleStartCheckout: ApiRouteHandler;
  handleEnqueueInvoiceGeneration: ApiRouteHandler;
  handleGetInvoiceGenerationJobStatus: ApiRouteHandler;
  handleProviderWebhook: ApiRouteHandler;
  jsonBodyLimitBytes?: number;
  metrics?: ApiMetrics;
  readinessCheck?: () => Promise<void>;
}

export interface StartApiServerInput {
  env?: NodeJS.ProcessEnv;
  config?: Partial<ApiServerConfig>;
  deps?: Partial<ApiRequestListenerDeps>;
}

export interface StartedApiServer {
  server: Server;
  config: ApiServerConfig;
  close: () => Promise<void>;
}

function normaliseHeaders(rawHeaders: IncomingHttpHeaders): Headers {
  const headers: Headers = {};

  for (const [key, value] of Object.entries(rawHeaders)) {
    if (Array.isArray(value)) {
      headers[key.toLowerCase()] = value.join(", ");
      continue;
    }

    headers[key.toLowerCase()] = value;
  }

  return headers;
}

async function readJsonBody(
  request: Parameters<RequestListener>[0],
  maxBytes: number,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > maxBytes) {
      throw new PayloadTooLargeError();
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (!rawBody) {
    return undefined;
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new BadRequestError("Invalid JSON body");
  }
}

function sendJson(response: Parameters<RequestListener>[1], status: number, body: unknown): void {
  response.statusCode = status;
  for (const [header, value] of Object.entries(DEFAULT_API_RESPONSE_HEADERS)) {
    response.setHeader(header, value);
  }
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function sendText(
  response: Parameters<RequestListener>[1],
  status: number,
  body: string,
  contentType: string,
): void {
  response.statusCode = status;
  for (const [header, value] of Object.entries(DEFAULT_API_RESPONSE_HEADERS)) {
    response.setHeader(header, value);
  }
  response.setHeader("content-type", contentType);
  response.end(body);
}

function sendApiResponse(
  response: Parameters<RequestListener>[1],
  apiResponse: ApiResponse,
): void {
  sendJson(response, apiResponse.status, apiResponse.body);
}

export function createApiRequestListener(
  deps: ApiRequestListenerDeps,
): RequestListener {
  const metrics = deps.metrics ?? getApiMetrics();
  const routes: Record<string, Record<string, ApiRouteHandler>> = {
    "/v1/auth/subscriptions": {
      POST: deps.handleCreateSubscription,
    },
    "/v1/checkout/sessions": {
      POST: deps.handleStartCheckout,
    },
    "/v1/invoices/generation": {
      POST: deps.handleEnqueueInvoiceGeneration,
    },
    "/v1/invoices/generation/status": {
      POST: deps.handleGetInvoiceGenerationJobStatus,
    },
    "/v1/webhooks/provider": {
      POST: deps.handleProviderWebhook,
    },
  };

  return async (request, response) => {
    const headers = normaliseHeaders(request.headers);
    const traceId = getHeader(headers, "x-trace-id") ?? undefined;
    const method = (request.method ?? "GET").toUpperCase();
    const url = new URL(request.url ?? "/", "http://grantledger.local");
    const startedAt = process.hrtime.bigint();
    let responseStatus = 500;
    const route = url.pathname;

    try {
      if (method === "GET" && url.pathname === "/healthz") {
        metrics.healthState.set(1);
        responseStatus = 200;
        sendJson(response, 200, { status: "ok" });
        return;
      }

      if (method === "GET" && url.pathname === "/readyz") {
        try {
          await deps.readinessCheck?.();
          metrics.readinessState.set(1);
          responseStatus = 200;
          sendJson(response, 200, { status: "ready" });
        } catch (error) {
          metrics.readinessState.set(0);
          responseStatus = 503;
          sendJson(response, 503, {
            status: "not_ready",
            message:
              error instanceof Error ? error.message : "Readiness check failed",
          });
        }
        return;
      }

      if (method === "GET" && url.pathname === "/metrics") {
        const body = await metrics.registry.metrics();
        responseStatus = 200;
        sendText(response, 200, body, metrics.registry.contentType);
        return;
      }

      const pathRoutes = routes[url.pathname];
      if (!pathRoutes) {
        responseStatus = 404;
        sendApiResponse(
          response,
          toApiErrorResponse(new NotFoundError("Route not found"), traceId),
        );
        return;
      }

      const routeHandler = pathRoutes[method];
      if (!routeHandler) {
        response.setHeader("allow", Object.keys(pathRoutes).join(", "));
        responseStatus = 405;
        sendJson(
          response,
          405,
          buildStandardErrorBody({
            message: "Method not allowed",
            code: "METHOD_NOT_ALLOWED",
            ...(traceId ? { traceId } : {}),
          }),
        );
        return;
      }

      const payload = await readJsonBody(
        request,
        deps.jsonBodyLimitBytes ?? Number.MAX_SAFE_INTEGER,
      );
      const apiResponse = await routeHandler(headers, payload);
      responseStatus = apiResponse.status;
      sendApiResponse(response, apiResponse);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        responseStatus = 413;
        sendJson(
          response,
          413,
          buildStandardErrorBody({
            message: error.message,
            code: "PAYLOAD_TOO_LARGE",
            ...(traceId ? { traceId } : {}),
          }),
        );
        return;
      }

      const apiErrorResponse = toApiErrorResponse(error, traceId);
      responseStatus = apiErrorResponse.status;
      sendApiResponse(response, apiErrorResponse);
    } finally {
      recordApiRequestMetric(metrics, {
        route,
        method,
        status: responseStatus,
        durationSeconds: Number(process.hrtime.bigint() - startedAt) / 1_000_000_000,
      });
    }
  };
}

function resolveReadinessCheck(pool: Pool | null): () => Promise<void> {
  if (!pool) {
    return async () => {};
  }

  return async () => {
    await pool.query("select 1");
  };
}

export async function startApiServer(
  input: StartApiServerInput = {},
): Promise<StartedApiServer> {
  const env = input.env ?? process.env;
  const runtimeConfig = resolveApiRuntimeConfig(env);
  configureStructuredLogging(resolveServiceObservabilityContext("api", env));
  const resolvedConfig = {
    host: runtimeConfig.host,
    port: runtimeConfig.port,
    jsonBodyLimitBytes: runtimeConfig.jsonBodyLimitBytes,
    ...(input.config?.host !== undefined ? { host: input.config.host } : {}),
    ...(input.config?.port !== undefined ? { port: input.config.port } : {}),
    ...(input.config?.jsonBodyLimitBytes !== undefined
      ? { jsonBodyLimitBytes: input.config.jsonBodyLimitBytes }
      : {}),
  };

  const postgresPool =
    runtimeConfig.persistenceDriver === "postgres"
      ? createPostgresPool({
          ...(runtimeConfig.databaseUrl
            ? { connectionString: runtimeConfig.databaseUrl }
            : {}),
        })
      : null;

  const apiRoot = createApiCompositionRoot({
    persistenceDriver: runtimeConfig.persistenceDriver,
    ...(runtimeConfig.stripeWebhookSecret
      ? { stripeWebhookSecret: runtimeConfig.stripeWebhookSecret }
      : {}),
    ...(postgresPool ? { postgresPool } : {}),
  });

  const requestListener = createApiRequestListener({
    handleCreateSubscription,
    handleStartCheckout: apiRoot.handleStartCheckout,
    handleEnqueueInvoiceGeneration:
      apiRoot.invoiceHandlers.handleEnqueueInvoiceGeneration,
    handleGetInvoiceGenerationJobStatus:
      apiRoot.invoiceHandlers.handleGetInvoiceGenerationJobStatus,
    handleProviderWebhook: apiRoot.webhookHandlers.handleProviderWebhook,
    jsonBodyLimitBytes: resolvedConfig.jsonBodyLimitBytes,
    metrics: getApiMetrics(env),
    readinessCheck: resolveReadinessCheck(postgresPool),
    ...input.deps,
  });

  const server = createServer(requestListener);
  server.listen(resolvedConfig.port, resolvedConfig.host);
  await once(server, "listening");

  emitStructuredLog({
    type: "api_server_started",
    payload: {
      host: resolvedConfig.host,
      port: resolvedConfig.port,
      jsonBodyLimitBytes: resolvedConfig.jsonBodyLimitBytes,
      persistenceDriver: runtimeConfig.persistenceDriver,
    },
  });

  return {
    server,
    config: resolvedConfig,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });

      await postgresPool?.end();

      emitStructuredLog({
        type: "api_server_stopped",
        payload: {
          host: resolvedConfig.host,
          port: resolvedConfig.port,
        },
      });
    },
  };
}

function isMainModule(moduleUrl: string): boolean {
  const entry = process.argv[1];
  return entry ? pathToFileURL(entry).href === moduleUrl : false;
}

async function runApiServerAsMain(): Promise<void> {
  const started = await startApiServer();
  let closing = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (closing) {
      return;
    }

    closing = true;
    emitStructuredLog({
      type: "api_server_stopping",
      payload: { signal },
    });

    await started.close();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

if (isMainModule(import.meta.url)) {
  void runApiServerAsMain().catch((error) => {
    emitStructuredLog({
      level: "error",
      type: "api_server_failed",
      payload: {
        message: error instanceof Error ? error.message : "Unknown startup error",
      },
    });
    process.exitCode = 1;
  });
}
