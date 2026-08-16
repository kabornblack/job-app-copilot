import { createClient } from "./supabase/client";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type ApiFetchInit = {
  method?: string;
  headers?: Record<string, string>;
  // FormData added for CV upload (PUT /profile/cv, multipart) — see the
  // Content-Type handling below: FormData must NOT get a manual
  // Content-Type, the browser sets its own multipart boundary.
  body?: string | FormData | null;
};

/** Authenticated fetch to the Fastify API (Bearer Supabase access token). */
export async function apiFetch(
  path: string,
  init: ApiFetchInit = {},
): Promise<Response> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  if (
    init.body &&
    typeof init.body === "string" &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const url = path.startsWith("http") ? path : `${apiUrl}${path}`;
  return fetch(url, { ...init, headers });
}

export function getApiUrl(): string {
  return apiUrl;
}
