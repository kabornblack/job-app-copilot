import { Client } from "pg";

const timeoutMs = 10000;
const timer = setTimeout(() => {
  console.error("TIMEOUT - connection never completed");
  process.exit(1);
}, timeoutMs);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  clearTimeout(timer);
  process.exit(1);
}

const client = new Client({ connectionString: databaseUrl });

async function run() {
  try {
    await client.connect();
    const result = await client.query("SELECT 1");
    console.log("SUCCESS - SELECT 1 result:", result.rows);
    await client.end();
    clearTimeout(timer);
    process.exit(0);
  } catch (error) {
    console.error("ERROR - full error object:", error);
    clearTimeout(timer);
    process.exit(1);
  }
}

void run();
