import { pathToFileURL } from "node:url";
import {
  createSubscription,
  type CreateSubscriptionCommandInput,
} from "@grantledger/application";
import {
  createPostgresPool,
  createPostgresSubscriptionUseCaseDeps,
} from "@grantledger/infra-postgres";

export interface DemoScenario {
  tenantId: string;
  userId: string;
  customerId: string;
  subscriptionId: string;
  planId: string;
  planVersionId: string;
  currency: "USD";
  priceAmountInCents: number;
  periodStart: string;
  periodEnd: string;
}

export interface DemoSeedConfig {
  databaseUrl: string;
  scenario: DemoScenario;
}

export const DEFAULT_DEMO_SCENARIO: DemoScenario = {
  tenantId: "t_1",
  userId: "u_1",
  customerId: "cus_demo_acme",
  subscriptionId: "sub_demo_basic",
  planId: "plan_demo_basic",
  planVersionId: "plan_demo_basic_v1",
  currency: "USD",
  priceAmountInCents: 4900,
  periodStart: "2026-03-01T00:00:00.000Z",
  periodEnd: "2026-04-01T00:00:00.000Z",
};

export const DEFAULT_DEMO_DATABASE_URL =
  "postgresql://grantledger_app:grantledger_app@127.0.0.1:15432/grantledger_rls";

export function resolveDemoSeedConfig(
  env: NodeJS.ProcessEnv = process.env,
): DemoSeedConfig {
  const databaseUrl =
    env.DEMO_DATABASE_URL?.trim() ||
    env.DATABASE_URL?.trim() ||
    DEFAULT_DEMO_DATABASE_URL;

  return {
    databaseUrl,
    scenario: DEFAULT_DEMO_SCENARIO,
  };
}

export interface DemoSeedResult {
  scenario: DemoScenario;
  created: boolean;
}

export async function seedDemoScenario(
  config: DemoSeedConfig = resolveDemoSeedConfig(),
): Promise<DemoSeedResult> {
  const pool = createPostgresPool({ connectionString: config.databaseUrl });

  try {
    const deps = createPostgresSubscriptionUseCaseDeps(
      pool,
      config.scenario.tenantId,
    );

    const existing = await deps.repository.findById(
      config.scenario.subscriptionId,
    );
    if (existing) {
      return {
        scenario: config.scenario,
        created: false,
      };
    }

    const input: CreateSubscriptionCommandInput = {
      subscriptionId: config.scenario.subscriptionId,
      tenantId: config.scenario.tenantId,
      customerId: config.scenario.customerId,
      planId: config.scenario.planId,
      currentPeriod: {
        startsAt: config.scenario.periodStart,
        endsAt: config.scenario.periodEnd,
      },
      context: {
        actor: { id: config.scenario.userId, type: "user" },
        reason: "demo bootstrap",
        traceId: "demo-seed-trace-v1",
        idempotencyKey: "demo-seed-create-subscription-v1",
        requestedAt: "2026-03-01T00:00:00.000Z",
      },
    };

    await createSubscription(deps, input);

    return {
      scenario: config.scenario,
      created: true,
    };
  } finally {
    await pool.end();
  }
}

function printDemoSeedSummary(result: DemoSeedResult): void {
  const { scenario, created } = result;

  console.log("GrantLedger demo scenario ready.");
  console.log(`- tenantId: ${scenario.tenantId}`);
  console.log(`- userId: ${scenario.userId}`);
  console.log(`- subscriptionId: ${scenario.subscriptionId}`);
  console.log(`- customerId: ${scenario.customerId}`);
  console.log(`- planId: ${scenario.planId}`);
  console.log(`- planVersionId: ${scenario.planVersionId}`);
  console.log(`- billing period: ${scenario.periodStart} -> ${scenario.periodEnd}`);
  console.log(`- seed status: ${created ? "created" : "already present"}`);
}

async function runAsMain(): Promise<void> {
  const result = await seedDemoScenario();
  printDemoSeedSummary(result);
}

function isMainModule(moduleUrl: string): boolean {
  const entry = process.argv[1];
  return entry ? pathToFileURL(entry).href === moduleUrl : false;
}

if (isMainModule(import.meta.url)) {
  void runAsMain().catch((error) => {
    const message =
      error instanceof Error ? error.message : "Unknown demo seed error";
    console.error(`GrantLedger demo seed failed: ${message}`);
    process.exitCode = 1;
  });
}
