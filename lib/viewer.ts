import "server-only";
import { query } from "./db";
import { currentUserId } from "./auth";
import { dbConfigured } from "./db";
import { applyPendingGrants } from "./grants";
import type { Viewer } from "./types";

export const GUEST: Viewer = { signedIn: false, ageConfirmed: false, owned: [] };

/** Who is looking, and what do they own? Never throws: a missing database means "nothing owned". */
export async function loadViewer(): Promise<{ userId: string | null; viewer: Viewer }> {
  const userId = await currentUserId();
  if (!userId) return { userId: null, viewer: GUEST };
  if (!dbConfigured()) return { userId, viewer: { signedIn: true, ageConfirmed: false, owned: [] } };
  try {
    const checked = await query("select 1 from grant_checks where user_id = $1", [userId]);
    if (!checked[0]) await applyPendingGrants(userId).catch((e) => console.error("pending grants failed", e)); // once per user
    const [profile, ents] = await Promise.all([
      query("select age_confirmed_at from profiles where user_id = $1", [userId]),
      query("select product, avatar_id from entitlements where user_id = $1", [userId]),
    ]);
    return {
      userId,
      viewer: {
        signedIn: true,
        ageConfirmed: !!profile[0]?.age_confirmed_at,
        owned: ents.map((e) => `${e.product}:${e.avatar_id}`),
      },
    };
  } catch (e) {
    console.error("loadViewer failed", e);
    return { userId, viewer: { signedIn: true, ageConfirmed: false, owned: [] } };
  }
}
