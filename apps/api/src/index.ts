import { createApiCompositionRoot } from "./bootstrap/composition-root.js";
import { validateApiRuntimeConfig } from "./bootstrap/runtime-config.js";

export { createApiCompositionRoot } from "./bootstrap/composition-root.js";
export * from "./handlers/auth.js";
export * from "./handlers/checkout.js";
export * from "./handlers/invoice.js";
export * from "./handlers/subscription.js";
export * from "./http/errors.js";
export * from "./http/headers.js";
export * from "./http/types.js";
export * from "./http/validation.js";

validateApiRuntimeConfig();

const apiRoot = createApiCompositionRoot();

export const handleStartCheckout = apiRoot.handleStartCheckout;
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
