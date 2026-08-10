/**
 * Manually set a user's plan (trial | trusted).
 *
 * pnpm --filter ./services/api exec tsx scripts/set-user-plan.ts <userId> trusted
 */
import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { setUserPlan } from "../src/lib/quota";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", "..", "..", ".env"), override: true });

const userId = process.argv[2];
const plan = process.argv[3];

if (!userId || (plan !== "trial" && plan !== "trusted")) {
  console.error("Usage: tsx scripts/set-user-plan.ts <userId> <trial|trusted>");
  process.exit(1);
}

await setUserPlan(userId, plan);
console.log(`Set user ${userId} plan=${plan}`);
process.exit(0);
