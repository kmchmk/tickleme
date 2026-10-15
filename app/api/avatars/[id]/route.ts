import { NextResponse } from "next/server";
import { getAvatar } from "@/lib/avatars";
import { buildBundle } from "@/lib/player-manifest";
import { loadViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

/** Everything the avatar page needs for this viewer in one go: all open outfits, the gates of the others, the transitions. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const avatar = getAvatar((await ctx.params).id);
  if (!avatar) return NextResponse.json({ error: "not-found" }, { status: 404 });
  const { viewer } = await loadViewer();
  try {
    return NextResponse.json(await buildBundle(avatar, viewer), { headers: { "cache-control": "private, no-store" } });
  } catch (e) {
    console.error("bundle failed", e);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
