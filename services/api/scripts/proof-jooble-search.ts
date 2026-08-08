/**
 * Live Jooble search smoke test (does not print the API key).
 * pnpm --filter ./services/api exec tsx scripts/proof-jooble-search.ts
 */
import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { searchJooble } from "../src/lib/jooble";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", "..", "..", ".env"), override: true });

async function main() {
  if (!process.env.JOOBLE_API_KEY?.trim()) {
    throw new Error("JOOBLE_API_KEY missing from .env");
  }

  const result = await searchJooble({
    skills: ["TypeScript", "React"],
    targetRoles: ["Software Engineer"],
    locations: ["Tallinn"],
    remotePref: "hybrid",
    resumeSummary: "Full-stack engineer",
  });

  console.log("requestUrl:", result.requestUrl);
  console.log("jobs returned:", result.jobs.length);
  console.log("rawResponse bytes:", result.rawResponseText.length);
  if (result.jobs[0]) {
    const j = result.jobs[0];
    console.log("first job:");
    console.log(`  source:      ${j.source}`);
    console.log(`  externalId:  ${j.externalId}`);
    console.log(`  title:       ${j.title}`);
    console.log(`  company:     ${j.company}`);
    console.log(`  location:    ${j.location}`);
    console.log(`  fingerprint: ${j.fingerprint}`);
    console.log(`  url:         ${j.url}`);
  }
}

void main();
