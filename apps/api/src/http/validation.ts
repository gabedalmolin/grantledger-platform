import { BadRequestError } from "@grantledger/application";
import { type ZodTypeAny } from "zod";

interface ValidationIssueDetail {
  path: string;
  message: string;
  code: string;
}

function mapValidationIssues(
  issues: { path: PropertyKey[]; message: string; code: string }[],
): ValidationIssueDetail[] {
  return issues.map((issue) => ({
    path:
      issue.path.length > 0
        ? issue.path.map((part) => String(part)).join(".")
        : "payload",
    message: issue.message,
    code: issue.code,
  }));
}

function formatValidationSummary(issues: ValidationIssueDetail[]): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}

export function parseOrThrowBadRequest<TSchema extends ZodTypeAny>(
  schema: TSchema,
  input: unknown,
  message = "Invalid request payload",
): TSchema["_output"] {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    const issues = mapValidationIssues(parsed.error.issues);
    const summary = formatValidationSummary(issues);
    throw new BadRequestError(`${message} - ${summary}`, {
      type: "validation",
      issues,
    });
  }

  return parsed.data;
}
