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
import { buildStandardErrorBody, emitStructuredLog } from "@grantledger/shared";
import type { Pool } from "pg";

import { createApiCompositionRoot } from "./bootstrap/composition-root.js";
import { resolveApiRuntimeConfig } from "./bootstrap/runtime-config.js";
import { handleCreateSubscription } from "./handlers/auth.js";
import { toApiErrorResponse } from "./http/errors.js";
import { getHeader } from "./http/headers.js";
import type { ApiResponse, Headers } from "./http/types.js";

const DEFAULT_API_HOST = "0.0.0.0";
const DEFAULT_API_PORT = 3000;

type ApiRouteHandler = (
  headers: Headers,
  payload: unknown,
) => Promise<ApiResponse> | ApiResponse;

export interface ApiServerConfig {
  host: string;
  port: number;
}

export interface ApiRequestListenerDeps {
  handleCreateSubscription: ApiRouteHandler;
  handleStartCheckout: ApiRouteHandler;
  handleEnqueueInvoiceGeneration: ApiRouteHandler;
  handleGetInvoiceGenerationJobStatus: ApiRouteHandler;
  handleProviderWebhook: ApiRouteHandler;
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

export function resolveApiServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ApiServerConfig {
  return {
    host: env.API_HOST?.trim() || DEFAULT_API_HOST,
    port: parsePort(env.API_PORT),
  };
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

async function readJsonBody(request: Parameters<RequestListener>[0]): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
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
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
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

    try {
      if (method === "GET" && url.pathname === "/healthz") {
        sendJson(response, 200, { status: "ok" });
        return;
      }

      if (method === "GET" && url.pathname === "/readyz") {
        try {
          await deps.readinessCheck?.();
          sendJson(response, 200, { status: "ready" });
        } catch (error) {
          sendJson(response, 503, {
            status: "not_ready",
            message:
              error instanceof Error ? error.message : "Readiness check failed",
          });
        }
        return;
      }

      const pathRoutes = routes[url.pathname];
      if (!pathRoutes) {
        sendApiResponse(
          response,
          toApiErrorResponse(new NotFoundError("Route not found"), traceId),
        );
        return;
      }

      const routeHandler = pathRoutes[method];
      if (!routeHandler) {
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

      const payload = await readJsonBody(request);
      const apiResponse = await routeHandler(headers, payload);
      sendApiResponse(response, apiResponse);
    } catch (error) {
      sendApiResponse(response, toApiErrorResponse(error, traceId));
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
  const resolvedConfig = {
    ...resolveApiServerConfig(env),
    ...(input.config?.host !== undefined ? { host: input.config.host } : {}),
    ...(input.config?.port !== undefined ? { port: input.config.port } : {}),
  };

  const postgresPool =
    runtimeConfig.persistenceDriver === "postgres"
      ? createPostgresPool({
          ...(env.DATABASE_URL?.trim()
            ? { connectionString: env.DATABASE_URL.trim() }
            : {}),
        })
      : null;

  const apiRoot = createApiCompositionRoot({
    persistenceDriver: runtimeConfig.persistenceDriver,
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
