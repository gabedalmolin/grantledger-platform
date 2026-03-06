import type {
  AuditActor,
  CatalogAuditEvent,
  CatalogQuery,
  CreatePlanInput,
  CreatePlanVersionInput,
  DeactivatePlanVersionInput,
  EffectiveCatalogItem,
  Plan,
  PlanVersion,
  PublishPlanVersionInput,
} from "@grantledger/contracts";
import {
  assertNoVersionOverlap,
  assertPublishedVersionImmutable,
  resolveEffectivePlanVersionAt,
} from "@grantledger/domain";

import { utcNowIso } from "@grantledger/shared";
import { NotFoundError } from "./errors.js";

export interface PlanCatalogRepository {
  createPlan(input: CreatePlanInput): Promise<Plan>;
  getPlanById(planId: string): Promise<Plan | null>;
  listPlans(): Promise<Plan[]>;
  createPlanVersion(input: CreatePlanVersionInput): Promise<PlanVersion>;
  getPlanVersion(
    planId: string,
    versionId: string,
  ): Promise<PlanVersion | null>;
  listPlanVersions(planId: string): Promise<PlanVersion[]>;
  savePlanVersion(planVersion: PlanVersion): Promise<void>;
}

export interface CatalogAuditLogger {
  log(event: CatalogAuditEvent): Promise<void>;
}

interface AuditInput {
  actor: AuditActor;
  reason: string;
  traceId: string;
}

export async function createPlan(
  repo: PlanCatalogRepository,
  audit: CatalogAuditLogger,
  input: CreatePlanInput,
  meta: AuditInput,
): Promise<Plan> {
  const plan = await repo.createPlan(input);
  await audit.log({
    event: "plan.created",
    actor: meta.actor,
    reason: meta.reason,
    traceId: meta.traceId,
    occurredAt: utcNowIso(),
    metadata: { planId: plan.id },
  });
  return plan;
}

export async function createPlanVersion(
  repo: PlanCatalogRepository,
  audit: CatalogAuditLogger,
  input: CreatePlanVersionInput,
  meta: AuditInput,
): Promise<PlanVersion> {
  const versions = await repo.listPlanVersions(input.planId);

  const candidate =
    input.endsAt === undefined
      ? { startsAt: input.startsAt }
      : { startsAt: input.startsAt, endsAt: input.endsAt };

  assertNoVersionOverlap(candidate, versions);

  const version = await repo.createPlanVersion(input);
  await audit.log({
    event: "plan_version.created",
    actor: meta.actor,
    reason: meta.reason,
    traceId: meta.traceId,
    occurredAt: utcNowIso(),
    metadata: { planId: input.planId, versionId: version.id },
  });
  return version;
}

export async function publishPlanVersion(
  repo: PlanCatalogRepository,
  audit: CatalogAuditLogger,
  input: PublishPlanVersionInput,
  meta: AuditInput,
): Promise<PlanVersion> {
  const version = await repo.getPlanVersion(input.planId, input.versionId);
  if (!version) throw new NotFoundError("Plan version not found");

  const next: PlanVersion = {
    ...version,
    status: "published",
    publishedAt: utcNowIso(),
  };

  await repo.savePlanVersion(next);
  await audit.log({
    event: "plan_version.published",
    actor: meta.actor,
    reason: meta.reason,
    traceId: meta.traceId,
    occurredAt: utcNowIso(),
    metadata: { planId: input.planId, versionId: input.versionId },
  });
  return next;
}

export async function deactivatePlanVersion(
  repo: PlanCatalogRepository,
  audit: CatalogAuditLogger,
  input: DeactivatePlanVersionInput,
  meta: AuditInput,
): Promise<PlanVersion> {
  const version = await repo.getPlanVersion(input.planId, input.versionId);
  if (!version) throw new NotFoundError("Plan version not found");

  const next: PlanVersion = { ...version, status: "deactivated" };
  await repo.savePlanVersion(next);
  await audit.log({
    event: "plan_version.deactivated",
    actor: meta.actor,
    reason: meta.reason,
    traceId: meta.traceId,
    occurredAt: utcNowIso(),
    metadata: { planId: input.planId, versionId: input.versionId },
  });
  return next;
}

export async function getEffectiveCatalog(
  repo: PlanCatalogRepository,
  query: CatalogQuery,
): Promise<EffectiveCatalogItem[]> {
  const plans = await repo.listPlans();
  const out: EffectiveCatalogItem[] = [];

  for (const plan of plans) {
    const versions = await repo.listPlanVersions(plan.id);
    const effective = resolveEffectivePlanVersionAt(versions, query.at);
    if (!effective) continue;
    out.push({ plan, version: effective });
  }

  return out;
}

export async function assertVersionNotCriticalMutated(
  current: PlanVersion,
): Promise<void> {
  assertPublishedVersionImmutable(current);
}
