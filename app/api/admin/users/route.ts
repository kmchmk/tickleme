import { NextResponse } from "next/server";
import { listUsers, requireAdmin, type UserFilter } from "@/lib/admin";

export const dynamic = "force-dynamic";

const FILTERS: UserFilter[] = ["all", "paying", "granted", "adult"];

/** ?q=search&filter=all|paying|granted|adult&page=0 */
export async function GET(req: Request) {
  const a = await requireAdmin(req);
  if ("response" in a) return a.response;
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const f = url.searchParams.get("filter") as UserFilter;
  const filter = FILTERS.includes(f) ? f : "all";
  const page = Math.max(0, Number(url.searchParams.get("page") ?? 0) || 0);
  const limit = 20;
  try {
    const { users, total } = await listUsers(q, page * limit, limit, filter);
    return NextResponse.json({ users, total, page, limit, me: a.admin.userId }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("admin users failed", e);
    return NextResponse.json({ error: "could not load users" }, { status: 502 });
  }
}
