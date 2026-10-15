import "server-only";
import { actionLock, variantGate } from "./access";
import { objectKey, posterUrl } from "./avatars";
import { fileUrl } from "./storage";
import type { AvatarBundle, AvatarDef, PlayerManifest, TransitionSet, VariantKey, Viewer } from "./types";
import type { Gate } from "./access";

/**
 * Builds what the player needs. Clips the viewer may not play are NOT included
 * (no URL at all), so a locked tap location can never be fetched.
 */
export async function buildPlayerManifest(
  avatar: AvatarDef,
  variantKey: VariantKey,
  viewer: Viewer,
): Promise<{ gate: Exclude<Gate, { ok: true }> } | { manifest: PlayerManifest }> {
  const variant = avatar.variants[variantKey];
  const gate = variantGate(avatar.id, variant, viewer);
  if (!gate.ok) return { gate };

  const actions = await Promise.all(
    variant.actions.map(async (a) => {
      const locked = actionLock(avatar.id, a, viewer);
      return {
        id: a.id,
        label: a.label,
        region: a.region,
        outline: a.outline,
        key: `${variant.bucket}:${objectKey(variant, a.video)}`,
        ...(locked ? { locked } : { url: await fileUrl(variant, a.video) }),
      };
    }),
  );
  return {
    manifest: {
      avatarId: avatar.id,
      variant: variantKey,
      name: avatar.name,
      aspectRatio: variant.aspectRatio,
      version: variant.version,
      idle: { url: await fileUrl(variant, variant.idle), key: `${variant.bucket}:${objectKey(variant, variant.idle)}` },
      poster: posterUrl(variant),
      actions,
    },
  };
}

/**
 * Transition clips for the pairs of outfits this viewer may play. A pair belongs to its lower outfit
 * (jeans for jeans <-> bikini, bikini for bikini <-> explicit), so it is offered exactly when that outfit is open.
 */
export async function buildTransitions(avatar: AvatarDef, viewer: Viewer): Promise<AvatarBundle["transitions"]> {
  const out: AvatarBundle["transitions"] = {};
  for (const k of ["jeans", "bikini"] as const) {
    const v = avatar.variants[k];
    if (!v.transitions || !variantGate(avatar.id, v, viewer).ok) continue;
    const ref = async (file: string) => ({ key: `${v.bucket}:${objectKey(v, file)}`, url: await fileUrl(v, file) });
    const set: TransitionSet = {
      version: v.transitions.version,
      up: await Promise.all(v.transitions.up.map(ref)),
      down: await Promise.all(v.transitions.down.map(ref)),
    };
    out[k] = set;
  }
  return out;
}

/** One request for the whole avatar page: every outfit the viewer may open (or why not) plus the transitions. */
export async function buildBundle(avatar: AvatarDef, viewer: Viewer): Promise<AvatarBundle> {
  const variants = {} as AvatarBundle["variants"];
  for (const k of ["jeans", "bikini", "explicit"] as VariantKey[]) {
    const r = await buildPlayerManifest(avatar, k, viewer);
    variants[k] = "gate" in r ? { status: "gated", gate: r.gate.reason } : { status: "open", manifest: r.manifest };
  }
  return { avatarId: avatar.id, name: avatar.name, variants, explicitBlur: avatar.variants.explicit.blur ?? 0.03, transitions: await buildTransitions(avatar, viewer) };
}
