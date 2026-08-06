import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dotenvPath = resolve(__dirname, "..", "..", "..", ".env");
console.log("Loading .env from:", dotenvPath);
config({ path: dotenvPath, override: true });

const databaseUrl = process.env.DATABASE_URL;
console.log("Using DATABASE_URL:", databaseUrl);
if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool);
const migrationsFolder = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "drizzle",
  "migrations",
);

async function run() {
  try {
    await migrate(db, { migrationsFolder });
    console.log("Migrations applied successfully");
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("Migration error:", error);
    await pool.end();
    process.exit(1);
  }
}

void run();
