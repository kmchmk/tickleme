import { NextResponse } from "next/server";
import { requireAdmin, userDetail } from "@/lib/admin";

export const dynamic = "force-dynamic";

/** One person: account, access (paid and admin-granted) and orders. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireAdmin(req);
  if ("response" in a) return a.response;
  const { id } = await ctx.params;
  if (!/^[\w-]{1,80}$/.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const d = await userDetail(id);
    if (!d) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(d, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("admin user failed", e);
    return NextResponse.json({ error: "could not load" }, { status: 502 });
  }
}
