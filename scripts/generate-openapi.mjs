import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  createSubscriptionPayloadSchema,
  createSubscriptionResponseSchema,
  startCheckoutPayloadSchema,
  startCheckoutResponseSchema,
  enqueueInvoiceGenerationPayloadSchema,
  enqueueInvoiceGenerationResponseSchema,
  getInvoiceGenerationJobStatusPayloadSchema,
  getInvoiceGenerationJobStatusResponseSchema,
  paymentWebhookEnvelopeSchema,
  paymentWebhookProcessResultSchema,
} from "../packages/contracts/dist/schemas/index.js";

const outPath = path.resolve(
  process.cwd(),
  "docs/openapi/openapi.json",
);

const CLIENT_ERROR_DESCRIPTIONS = {
  "400": "Bad Request",
  "401": "Unauthorized",
  "403": "Forbidden",
  "404": "Not Found",
  "409": "Conflict",
};

const OPERATION_METADATA = {
  "/v1/auth/subscriptions": {
    post: {
      summary: "Create subscription",
      operationId: "createSubscription",
      security: [{ bearerAuth: [] }],
      clientErrors: ["400", "401", "409"],
    },
  },
  "/v1/checkout/sessions": {
    post: {
      summary: "Start checkout session",
      operationId: "startCheckoutSession",
      security: [{ bearerAuth: [] }],
      clientErrors: ["400", "401"],
    },
  },
  "/v1/invoices/generation": {
    post: {
      summary: "Enqueue invoice generation",
      operationId: "enqueueInvoiceGeneration",
      security: [{ bearerAuth: [] }],
      clientErrors: ["400", "401"],
    },
  },
  "/v1/invoices/generation/status": {
    post: {
      summary: "Get invoice generation status",
      operationId: "getInvoiceGenerationStatus",
      security: [{ bearerAuth: [] }],
      clientErrors: ["400", "401", "404"],
    },
  },
  "/v1/webhooks/provider": {
    post: {
      summary: "Process payment provider webhook",
      operationId: "processPaymentProviderWebhook",
      security: [],
      clientErrors: ["400", "401"],
    },
  },
};

function enrichForLint(doc) {
  doc.info = {
    ...doc.info,
    license: doc.info?.license ?? {
      name: "UNLICENSED",
      identifier: "UNLICENSED",
    },
  };

  doc.servers = doc.servers?.length
    ? doc.servers
    : [
      { url: "https://api.grantledger.com", description: "Production" },
    ];

  doc.components = doc.components ?? {};
  doc.components.securitySchemes = doc.components.securitySchemes ?? {};
  doc.components.securitySchemes.bearerAuth =
    doc.components.securitySchemes.bearerAuth ?? {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    };

  for (const [path, methods] of Object.entries(OPERATION_METADATA)) {
    const pathItem = doc.paths?.[path];
    if (!pathItem) continue;

    for (const [method, meta] of Object.entries(methods)) {
      const op = pathItem[method];
      if (!op) continue;

      op.summary ??= meta.summary;
      op.operationId ??= meta.operationId;
      op.security ??= meta.security;
      op.responses = op.responses ?? {};

      for (const status of meta.clientErrors) {
        op.responses[status] ??= {
          description: CLIENT_ERROR_DESCRIPTIONS[status] ?? "Client Error",
        };
      }
    }
  }
}

const components = {
  CreateSubscriptionPayload: z.toJSONSchema(createSubscriptionPayloadSchema),
  CreateSubscriptionResponse: z.toJSONSchema(createSubscriptionResponseSchema),
  StartCheckoutPayload: z.toJSONSchema(startCheckoutPayloadSchema),
  StartCheckoutResponse: z.toJSONSchema(startCheckoutResponseSchema),
  EnqueueInvoiceGenerationPayload: z.toJSONSchema(
    enqueueInvoiceGenerationPayloadSchema,
  ),
  EnqueueInvoiceGenerationResponse: z.toJSONSchema(
    enqueueInvoiceGenerationResponseSchema,
  ),
  GetInvoiceGenerationJobStatusPayload: z.toJSONSchema(
    getInvoiceGenerationJobStatusPayloadSchema,
  ),
  GetInvoiceGenerationJobStatusResponse: z.toJSONSchema(
    getInvoiceGenerationJobStatusResponseSchema,
  ),
  PaymentWebhookEnvelope: z.toJSONSchema(paymentWebhookEnvelopeSchema),
  PaymentWebhookProcessResult: z.toJSONSchema(
    paymentWebhookProcessResultSchema,
  ),
};

const spec = {
  openapi: "3.1.0",
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  info: {
    title: "GrantLedger API",
    version: "0.1.0",
  },
  paths: {
    "/v1/auth/subscriptions": {
      post: {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateSubscriptionPayload" },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateSubscriptionResponse" },
              },
            },
          },
        },
      },
    },
    "/v1/checkout/sessions": {
      post: {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/StartCheckoutPayload" },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StartCheckoutResponse" },
              },
            },
          },
        },
      },
    },
    "/v1/invoices/generation": {
      post: {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/EnqueueInvoiceGenerationPayload" },
            },
          },
        },
        responses: {
          "202": {
            description: "Accepted",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/EnqueueInvoiceGenerationResponse" },
              },
            },
          },
        },
      },
    },
    "/v1/invoices/generation/status": {
      post: {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/GetInvoiceGenerationJobStatusPayload",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/GetInvoiceGenerationJobStatusResponse",
                },
              },
            },
          },
        },
      },
    },
    "/v1/webhooks/provider": {
      post: {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PaymentWebhookEnvelope" },
            },
          },
        },
        responses: {
          "200": {
            description: "Processed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaymentWebhookProcessResult" },
              },
            },
          },
        },
      },
    },
  },
  components: { schemas: components },
};

const document = spec;
enrichForLint(document);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(document, null, 2) + "\n");
console.log(`OpenAPI generated at ${outPath}`);
