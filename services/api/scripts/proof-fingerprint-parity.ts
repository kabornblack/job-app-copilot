/**
 * One-off proof: SQL-stored fingerprint vs Node computeJobFingerprint
 * for a real jobs row. Run: pnpm --filter ./services/api exec tsx scripts/proof-fingerprint-parity.ts
 */
import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import { computeJobFingerprint } from "../src/lib/job-fingerprint";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", "..", "..", ".env"), override: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const counts = await pool.query<{
    jobs: string;
    listings: string;
  }>(`
    SELECT
      (SELECT count(*)::text FROM jobs) AS jobs,
      (SELECT count(*)::text FROM job_source_listings) AS listings
  `);

  const constraints = await pool.query<{
    conname: string;
    def: string;
  }>(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid IN ('jobs'::regclass, 'job_source_listings'::regclass)
      AND contype = 'u'
    ORDER BY conname
  `);

  const indexes = await pool.query<{ indexname: string }>(`
    SELECT indexname FROM pg_indexes
    WHERE indexname IN (
      'jobs_fingerprint_idx',
      'job_source_listings_job_id_idx',
      'jobs_source_external_id_unique',
      'job_source_listings_source_external_id_unique'
    )
    ORDER BY indexname
  `);

  const row = await pool.query<{
    id: string;
    title: string;
    company: string;
    location: string | null;
    fingerprint: string;
    sql_recompute: string;
  }>(`
    SELECT
      id,
      title,
      company,
      location,
      fingerprint,
      encode(
        digest(
          convert_to(lower(trim(regexp_replace(title, '\\s+', ' ', 'g'))), 'UTF8')
            || '\\000'::bytea
            || convert_to(lower(trim(regexp_replace(company, '\\s+', ' ', 'g'))), 'UTF8')
            || '\\000'::bytea
            || convert_to(
              lower(trim(regexp_replace(coalesce(location, ''), '\\s+', ' ', 'g'))),
              'UTF8'
            ),
          'sha256'
        ),
        'hex'
      ) AS sql_recompute
    FROM jobs
    ORDER BY ingested_at DESC
    LIMIT 1
  `);

  const job = row.rows[0];
  if (!job) {
    throw new Error("No jobs rows to compare");
  }

  const nodeFingerprint = computeJobFingerprint({
    title: job.title,
    company: job.company,
    location: job.location,
  });

  console.log("--- migration structure ---");
  console.log(`jobs count:              ${counts.rows[0].jobs}`);
  console.log(`job_source_listings:     ${counts.rows[0].listings}`);
  console.log("unique constraints:");
  for (const c of constraints.rows) {
    console.log(`  ${c.conname}: ${c.def}`);
  }
  console.log("indexes:");
  for (const i of indexes.rows) {
    console.log(`  ${i.indexname}`);
  }

  console.log("\n--- real job row ---");
  console.log(`id:       ${job.id}`);
  console.log(`title:    ${JSON.stringify(job.title)}`);
  console.log(`company:  ${JSON.stringify(job.company)}`);
  console.log(`location: ${JSON.stringify(job.location)}`);

  console.log("\n--- fingerprints (side by side) ---");
  console.log(`stored (after migration UPDATE): ${job.fingerprint}`);
  console.log(`SQL recompute (same expression): ${job.sql_recompute}`);
  console.log(`Node computeJobFingerprint:      ${nodeFingerprint}`);
  console.log(
    `stored === SQL:  ${job.fingerprint === job.sql_recompute}`,
  );
  console.log(
    `stored === Node: ${job.fingerprint === nodeFingerprint}`,
  );
  console.log(
    `SQL === Node:    ${job.sql_recompute === nodeFingerprint}`,
  );

  await pool.end();

  if (
    job.fingerprint !== nodeFingerprint ||
    job.sql_recompute !== nodeFingerprint
  ) {
    process.exit(1);
  }
}

void main();
