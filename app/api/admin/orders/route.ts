import { NextResponse } from "next/server";
import { listOrders, requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

/** ?status=all|paid|pending&page=0 */
export async function GET(req: Request) {
  const a = await requireAdmin(req);
  if ("response" in a) return a.response;
  const url = new URL(req.url);
  const s = url.searchParams.get("status");
  const status = s === "paid" || s === "pending" ? s : "all";
  const page = Math.max(0, Number(url.searchParams.get("page") ?? 0) || 0);
  const limit = 25;
  try {
    return NextResponse.json({ ...(await listOrders(status, page * limit, limit)), page, limit }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("admin orders failed", e);
    return NextResponse.json({ error: "could not load orders" }, { status: 502 });
  }
}
