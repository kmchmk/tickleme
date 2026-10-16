import { NextResponse } from "next/server";
import { emailsOf, listAudit, listOrders, listPending, requireAdmin, stats } from "@/lib/admin";

export const dynamic = "force-dynamic";

/** Headline numbers, recent sales, invitations waiting for a sign-up and the recent admin actions. */
export async function GET(req: Request) {
  const a = await requireAdmin(req);
  if ("response" in a) return a.response;
  try {
    const [s, sales, pending, audit] = await Promise.all([stats(), listOrders("paid", 0, 6), listPending(), listAudit()]);
    // Fill in the email for actions recorded by user id.
    const ids = audit.filter((r) => !r.target_email && r.target_user_id).map((r) => String(r.target_user_id));
    if (ids.length) {
      const emails = await emailsOf(ids).catch(() => new Map<string, string>());
      for (const r of audit) if (!r.target_email && r.target_user_id) r.target_email = emails.get(String(r.target_user_id)) ?? null;
    }
    return NextResponse.json({ stats: s, sales: sales.orders, pending, audit }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("admin overview failed", e);
    return NextResponse.json({ error: "could not load" }, { status: 502 });
  }
}
