import { NextResponse } from "next/server";
import { getAvatars } from "@/lib/avatars";
import { buildTransitions } from "@/lib/player-manifest";
import { loadViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

/** For the home page: the transition clips every avatar offers this viewer (the same pairs the avatar page gets). */
export async function GET() {
  const { viewer } = await loadViewer();
  try {
    const entries = await Promise.all(getAvatars().map(async (a) => [a.id, await buildTransitions(a, viewer)] as const));
    return NextResponse.json(Object.fromEntries(entries), { headers: { "cache-control": "private, no-store" } });
  } catch (e) {
    console.error("transitions failed", e);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
