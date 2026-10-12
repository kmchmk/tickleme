import { NextResponse } from "next/server";
import { isVariantKey } from "@/lib/access";
import { getAvatar } from "@/lib/avatars";
import { buildPlayerManifest } from "@/lib/player-manifest";
import { loadViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

/** The player manifest for one variant: only clips this viewer may play, with short-lived links. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; variant: string }> }) {
  const { id, variant } = await ctx.params;
  const avatar = getAvatar(id);
  if (!avatar || !isVariantKey(variant)) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const { viewer } = await loadViewer();
  try {
    const result = await buildPlayerManifest(avatar, variant, viewer);
    if ("gate" in result) {
      // 401 = sign in, 403 = age confirmation or purchase needed.
      return NextResponse.json({ gate: result.gate.reason }, { status: result.gate.reason === "signin" ? 401 : 403, headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json(result.manifest, { headers: { "cache-control": "private, no-store" } });
  } catch (e) {
    console.error("manifest failed", e);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
