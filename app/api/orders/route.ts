import { NextResponse } from "next/server";
import { isProduct } from "@/lib/access";
import { getAvatar } from "@/lib/avatars";
import { MOCK_PAYMENTS, paymentsConfigured } from "@/lib/config";
import { createOrder } from "@/lib/orders";
import { loadViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

/** Start an unlock purchase: returns a Solana Pay request (USDC) for the wallet. */
export async function POST(req: Request) {
  const { userId, viewer } = await loadViewer();
  if (!userId) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!viewer.ageConfirmed) return NextResponse.json({ error: "age" }, { status: 403 });
  if (!paymentsConfigured() && !MOCK_PAYMENTS) return NextResponse.json({ error: "payments-unavailable" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { avatarId?: string; product?: string };
  const avatar = body.avatarId ? getAvatar(body.avatarId) : undefined;
  if (!avatar || !body.product || !isProduct(body.product)) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  try {
    return NextResponse.json(await createOrder(userId, avatar, body.product, viewer));
  } catch (e) {
    if ((e as Error).message === "already-owned") return NextResponse.json({ error: "already-owned" }, { status: 409 });
    console.error("create order failed", e);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
