import { NextResponse } from "next/server";
import { grantAccess, requireAdmin, revokeAccess, revokePending } from "@/lib/admin";

export const dynamic = "force-dynamic";

/** { action: "grant" | "revoke" | "revoke_pending", userId?, email?, avatarId: id | "*", product, note? } */
export async function POST(req: Request) {
  const a = await requireAdmin(req);
  if ("response" in a) return a.response;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b.avatarId !== "string") return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  const admin = a.admin.email;
  try {
    const origin = new URL(req.url).origin;
    const str = (v: unknown) => (typeof v === "string" ? v : undefined);
    const result =
      b.action === "grant"
        ? await grantAccess({ admin, userId: str(b.userId), email: str(b.email), avatarId: b.avatarId, product: b.product, note: str(b.note), origin })
        : b.action === "revoke" && str(b.userId)
          ? await revokeAccess({ admin, userId: str(b.userId)!, avatarId: b.avatarId, product: b.product })
          : b.action === "revoke_pending" && str(b.email)
            ? await revokePending({ admin, email: str(b.email)!, avatarId: b.avatarId, product: b.product })
            : ({ ok: false, error: "bad request" } as const);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (e) {
    console.error("admin grant failed", e);
    return NextResponse.json({ ok: false, error: "something went wrong" }, { status: 500 });
  }
}
