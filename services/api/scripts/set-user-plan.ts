/**
 * Manually set a user's plan (free | pro | trusted | payg).
 *
 * payg is reserved for future Stripe-backed metering - it has no logic
 * behind it yet. Setting a user to payg today just marks them as such;
 * quota.ts currently blocks all metered actions for that plan rather than
 * allowing unlimited usage (see quota.ts's payg branches).
 *
 * There is no automatic Pro -> Free reversion (no billing events to hook
 * into without real Stripe integration) - reverting a lapsed Pro user is
 * the same manual action as granting the plan in the first place:
 *
 * pnpm --filter ./services/api exec tsx scripts/set-user-plan.ts <userId> free
 */
import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { setUserPlan } from "../src/lib/quota";
import type { UserPlan } from "../src/db/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", "..", "..", ".env"), override: true });

const VALID_PLANS: readonly UserPlan[] = ["free", "pro", "trusted", "payg"];

const userId = process.argv[2];
const plan = process.argv[3] as UserPlan | undefined;

if (!userId || !plan || !VALID_PLANS.includes(plan)) {
  console.error(
    `Usage: tsx scripts/set-user-plan.ts <userId> <${VALID_PLANS.join("|")}>`,
  );
  process.exit(1);
}

await setUserPlan(userId, plan);
console.log(`Set user ${userId} plan=${plan}`);
process.exit(0);
