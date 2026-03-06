import { createApiCompositionRoot } from "./bootstrap/composition-root.js";
import { validateApiRuntimeConfig } from "./bootstrap/runtime-config.js";

export { createApiCompositionRoot } from "./bootstrap/composition-root.js";
export * from "./handlers/auth.js";
export * from "./handlers/checkout.js";
export {
  createInvoiceHandlers,
  type InvoiceHandlers,
  type InvoiceHandlersDeps,
} from "./handlers/invoice.js";
export * from "./handlers/subscription.js";
export * from "./http/errors.js";
export * from "./http/headers.js";
export * from "./http/types.js";
export * from "./http/validation.js";
export {
  createWebhookHandlers,
  StructuredLogCanonicalEventPublisher,
  StructuredLogWebhookAuditStore,
  type WebhookHandlerDeps,
  type WebhookHandlers,
} from "./handlers/webhook.js";


validateApiRuntimeConfig();

const apiRoot = createApiCompositionRoot();

export const handleStartCheckout = apiRoot.handleStartCheckout;
export const handleEnqueueInvoiceGeneration =
  apiRoot.invoiceHandlers.handleEnqueueInvoiceGeneration;
export const handleGetInvoiceGenerationJobStatus =
  apiRoot.invoiceHandlers.handleGetInvoiceGenerationJobStatus;
export const handleProviderWebhook =
  apiRoot.webhookHandlers.handleProviderWebhook;
export const handleCreateSubscriptionCommand =
  apiRoot.handleCreateSubscriptionCommand;
export const handleUpgradeSubscriptionCommand =
  apiRoot.handleUpgradeSubscriptionCommand;
export const handleDowngradeSubscriptionCommand =
  apiRoot.handleDowngradeSubscriptionCommand;
export const handleCancelSubscriptionNowCommand =
  apiRoot.handleCancelSubscriptionNowCommand;
export const handleCancelSubscriptionAtPeriodEndCommand =
  apiRoot.handleCancelSubscriptionAtPeriodEndCommand;
