import { NextResponse } from "next/server";
import { listAudit, listPending, requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

/** Pending (not yet signed up) grants and the recent admin actions. */
export async function GET(req: Request) {
  const a = await requireAdmin(req);
  if ("response" in a) return a.response;
  const [pending, audit] = await Promise.all([listPending(), listAudit()]);
  return NextResponse.json({ pending, audit }, { headers: { "cache-control": "no-store" } });
}
