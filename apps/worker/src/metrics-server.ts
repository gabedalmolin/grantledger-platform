import {
  createServer,
  type RequestListener,
  type Server,
} from "node:http";

import { emitStructuredLog } from "@grantledger/shared";

import type { WorkerMetrics } from "./metrics.js";

const DEFAULT_METRICS_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
} as const;

export interface WorkerMetricsServerConfig {
  host: string;
  port: number;
}

export interface StartWorkerMetricsServerInput {
  metrics: WorkerMetrics;
  config: WorkerMetricsServerConfig;
}

export interface StartedWorkerMetricsServer {
  server: Server;
  close: () => Promise<void>;
}

function sendText(
  response: Parameters<RequestListener>[1],
  status: number,
  body: string,
  contentType: string,
): void {
  response.statusCode = status;
  for (const [header, value] of Object.entries(DEFAULT_METRICS_HEADERS)) {
    response.setHeader(header, value);
  }
  response.setHeader("content-type", contentType);
  response.end(body);
}

function createWorkerMetricsListener(metrics: WorkerMetrics): RequestListener {
  return async (request, response) => {
    const url = new URL(request.url ?? "/", "http://grantledger.local");
    const method = (request.method ?? "GET").toUpperCase();

    if (method === "GET" && url.pathname === "/healthz") {
      sendText(response, 200, JSON.stringify({ status: "ok" }), "application/json; charset=utf-8");
      return;
    }

    if (method === "GET" && url.pathname === "/metrics") {
      const body = await metrics.registry.metrics();
      sendText(response, 200, body, metrics.registry.contentType);
      return;
    }

    sendText(
      response,
      404,
      JSON.stringify({ message: "Route not found" }),
      "application/json; charset=utf-8",
    );
  };
}

export async function startWorkerMetricsServer(
  input: StartWorkerMetricsServerInput,
): Promise<StartedWorkerMetricsServer> {
  const server = createServer(createWorkerMetricsListener(input.metrics));

  await new Promise<void>((resolve, reject) => {
    server.listen(input.config.port, input.config.host, (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  emitStructuredLog({
    type: "worker_metrics_server_started",
    payload: {
      host: input.config.host,
      port: input.config.port,
    },
  });

  return {
    server,
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
    },
  };
}
