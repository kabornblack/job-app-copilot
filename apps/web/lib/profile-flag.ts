/**
 * Presentation-layer proxy for "does this user have a profile yet."
 *
 * There is no GET /profile endpoint on the API, so `/` can't ask the
 * backend directly. Source of truth is still the review queue (empty vs
 * non-empty) — this flag only exists to skip the redirect flash on repeat
 * visits once we've already seen evidence a profile exists. If it's wrong
 * (e.g. a different browser), the review-queue check corrects it.
 */
const STORAGE_KEY = "jac:hasProfile";

export function getHasProfileFlag(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setHasProfileFlag(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // localStorage unavailable (private mode, etc.) — flag is best-effort only
  }
}
