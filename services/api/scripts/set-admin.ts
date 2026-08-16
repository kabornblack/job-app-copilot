/**
 * Manually grant or revoke admin access (ADR-0006). Same one-off-script
 * pattern as set-user-plan.ts - is_admin is never settable through any
 * route or UI, only this script.
 *
 * pnpm --filter ./services/api exec tsx scripts/set-admin.ts <userId> true
 * pnpm --filter ./services/api exec tsx scripts/set-admin.ts <userId> false
 */
import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { setUserAdmin } from "../src/lib/auth";
import { ensureUserSettings } from "../src/lib/quota";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", "..", "..", ".env"), override: true });

const userId = process.argv[2];
const flag = process.argv[3];

if (!userId || (flag !== "true" && flag !== "false")) {
  console.error("Usage: tsx scripts/set-admin.ts <userId> <true|false>");
  process.exit(1);
}

await ensureUserSettings(userId);
await setUserAdmin(userId, flag === "true");
console.log(`Set user ${userId} is_admin=${flag}`);
process.exit(0);
