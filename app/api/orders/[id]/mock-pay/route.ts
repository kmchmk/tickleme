import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { MOCK_PAYMENTS } from "@/lib/config";
import { mockPay } from "@/lib/orders";

export const dynamic = "force-dynamic";

/** Development only (PAYMENTS_MOCK=1 and not production): pretend the payment arrived. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!MOCK_PAYMENTS) return NextResponse.json({ error: "not-found" }, { status: 404 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "signin" }, { status: 401 });
  const order = await mockPay(userId, (await ctx.params).id);
  return order ? NextResponse.json(order) : NextResponse.json({ error: "not-found" }, { status: 404 });
}
