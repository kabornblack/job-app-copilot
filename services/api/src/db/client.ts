import { config } from "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Load the repo-root .env explicitly and allow it to override existing env values
// so local Docker Compose settings (e.g. DATABASE_URL -> port 5433) are used.
// Resolve the repository root .env (services/api/src/db -> ../../../../.env)
const dotenvPath = resolve(__dirname, "..", "..", "..", "..", ".env");
console.log("Loading .env from:", dotenvPath);
config({ path: dotenvPath, override: true });

const databaseUrl = process.env.DATABASE_URL;
console.log("Using DATABASE_URL:", databaseUrl);
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for API database connection");
}

const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(pool);
