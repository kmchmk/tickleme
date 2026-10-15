// Pure admin helpers (no server imports) so they can be unit-tested directly.
import type { Product } from "./types";

/** "A@x.com, b@y.com" -> ["a@x.com", "b@y.com"] (trimmed, lower-cased, no empties). */
export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export const isAllowedAdmin = (email: string | null | undefined, allowed: string[]): boolean => !!email && allowed.includes(email.trim().toLowerCase());

export const PRODUCTS: Product[] = ["taps", "explicit", "bundle"];
export const isGrantProduct = (p: unknown): p is Product => typeof p === "string" && (PRODUCTS as string[]).includes(p);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const looksLikeEmail = (e: unknown): e is string => typeof e === "string" && e.length <= 254 && EMAIL.test(e.trim());

/** Same-site check for state-changing admin requests: the Origin header, when present, must be this site. */
export function sameOrigin(origin: string | null, host: string | null): boolean {
  if (!origin) return true; // non-browser callers and same-origin GET-like fetches carry none
  try {
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}
