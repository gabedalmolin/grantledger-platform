export const enUSMessages = {
  "auth.authorized": "Authorized",
  "subscription.created": "Created",
  "subscription.replayed": "Replayed",
  "checkout.session_created": "Checkout session created",
  "error.auth.authentication_required": "User is not authenticated",
  "error.auth.forbidden": "User has no access to this tenant",
  "error.bad_request": "Invalid request input",
  "error.validation_failed": "Validation failed",
  "error.not_found": "Resource not found",
  "error.conflict": "Conflict",
  "error.domain_conflict": "Domain conflict",
  "error.idempotency.missing_key": "Idempotency-Key is required",
  "error.idempotency.conflict":
    "Idempotency key reuse with different payload",
  "error.idempotency.in_progress":
    "Idempotent request is already processing",
  "error.internal": "Unexpected error",
  "error.unexpected": "Unexpected error",
} as const;

export type EnUSMessageKey = keyof typeof enUSMessages;
