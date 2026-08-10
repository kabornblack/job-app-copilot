import { createBrowserClient } from "@supabase/ssr";

function normalizeSupabaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required",
    );
  }
  return createBrowserClient(normalizeSupabaseUrl(url), anonKey);
}
