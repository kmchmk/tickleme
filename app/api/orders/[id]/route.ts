import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { refreshOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";

/** Order status. While pending, each call checks the chain; a valid payment unlocks right away. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "signin" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not-found" }, { status: 404 });
  const order = await refreshOrder(userId, id).catch((e) => {
    console.error("refresh failed", e);
    return undefined;
  });
  if (order === undefined) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  if (!order) return NextResponse.json({ error: "not-found" }, { status: 404 });
  return NextResponse.json(order, { headers: { "cache-control": "no-store" } });
}
