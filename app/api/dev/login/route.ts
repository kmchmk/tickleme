import { NextResponse } from "next/server";
import { AUTH_ENABLED } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Development only, and only when Clerk is not configured: /api/dev/login?u=alice (or ?u= to sign out). */
export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production" || AUTH_ENABLED) return NextResponse.json({ error: "not-found" }, { status: 404 });
  const name = (new URL(req.url).searchParams.get("u") ?? "").replace(/[^a-z0-9_-]/gi, "").slice(0, 24);
  const res = NextResponse.json({ ok: true, user: name || null });
  if (name) res.cookies.set("dev_user", name, { path: "/", httpOnly: true, sameSite: "lax" });
  else res.cookies.delete("dev_user");
  return res;
}
