/**
 * End-to-end auth proof: create user → login → Bearer 200 / no Bearer 401.
 * Uses admin.createUser(email_confirm: true) + @example.com so no confirmation
 * email is sent (avoids bounce-rate flags from fake mailboxes).
 *
 * pnpm --filter ./services/api exec tsx scripts/proof-supabase-auth.ts
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", "..", "..", ".env"), override: true });

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";
const supabaseUrl = process.env.SUPABASE_URL?.trim()
  .replace(/\/+$/, "")
  .replace(/\/rest\/v1$/i, "");
const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error(
    "SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY required",
  );
}

const email = `copilot.auth.proof.${Date.now()}@example.com`;
const password =
  process.env.PROOF_ISO_PASSWORD?.trim() ||
  `ProofPass-${Date.now()}Aa1`;

async function main() {
  console.log("supabase host:", new URL(supabaseUrl!).host);
  console.log("email:", email);

  const supabase = createClient(supabaseUrl!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("\n--- createUser (admin, email_confirm: true, no outbound email) ---");
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw new Error(
      `admin.createUser failed: ${created.error?.message ?? "no user"}`,
    );
  }
  const userId = created.data.user.id;
  const createdVia = "admin.createUser";

  console.log("user id:", userId);
  console.log("created via:", createdVia);

  console.log("\n--- login (signInWithPassword) ---");
  const login = await supabase.auth.signInWithPassword({ email, password });
  if (login.error) {
    throw new Error(`login failed: ${login.error.message}`);
  }
  const accessToken = login.data.session?.access_token;
  console.log("session after login:", login.data.session ? "yes" : "no");
  console.log("access_token length:", accessToken?.length ?? 0);
  if (!accessToken) {
    throw new Error("No access token after login");
  }

  console.log("\n--- GET /health (public) ---");
  const health = await fetch(`${apiUrl}/health`);
  console.log("status:", health.status, await health.text());

  console.log("\n--- GET /applications/review-queue WITHOUT Authorization ---");
  const unauth = await fetch(`${apiUrl}/applications/review-queue`);
  const unauthBody = await unauth.text();
  console.log("status:", unauth.status);
  console.log("body:", unauthBody);

  console.log("\n--- GET /applications/review-queue WITH Bearer token ---");
  const auth = await fetch(`${apiUrl}/applications/review-queue`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const authBody = await auth.text();
  console.log("status:", auth.status);
  console.log("body preview:", authBody.slice(0, 240));

  console.log("\n--- browser gate: GET http://localhost:3000/ (no cookies) ---");
  const web = await fetch("http://localhost:3000/", { redirect: "manual" });
  console.log("status:", web.status);
  console.log("location:", web.headers.get("location"));

  console.log("\n--- browser: GET http://localhost:3000/login ---");
  const loginPage = await fetch("http://localhost:3000/login", {
    redirect: "manual",
  });
  const loginHtml = await loginPage.text();
  console.log("status:", loginPage.status);
  console.log("contains Log in form:", loginHtml.includes("Log in"));

  console.log("\n--- browser: GET http://localhost:3000/signup ---");
  const signupPage = await fetch("http://localhost:3000/signup", {
    redirect: "manual",
  });
  const signupHtml = await signupPage.text();
  console.log("status:", signupPage.status);
  console.log("contains Sign up form:", signupHtml.includes("Sign up"));

  const ok =
    health.status === 200 &&
    unauth.status === 401 &&
    auth.status === 200 &&
    Boolean(accessToken) &&
    (web.status === 307 || web.status === 302 || web.status === 303) &&
    (web.headers.get("location") ?? "").includes("/login") &&
    loginPage.status === 200 &&
    signupPage.status === 200;

  if (!ok) {
    console.error("\nPROOF FAILED");
    process.exit(1);
  }
  console.log(
    "\nPROOF OK: user created + login session; API unauth 401 / auth 200; web redirects / → /login",
  );
}

void main();
