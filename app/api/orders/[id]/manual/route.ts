import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { enableManualPayment } from "@/lib/orders";

export const dynamic = "force-dynamic";

/** The buyer wants to pay without Solana Pay (exchange / plain transfer): give the order its unique exact amount. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "signin" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not-found" }, { status: 404 });
  try {
    const order = await enableManualPayment(userId, id);
    if (!order) return NextResponse.json({ error: "not-found" }, { status: 404 });
    return NextResponse.json(order, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("manual payment failed", e);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
