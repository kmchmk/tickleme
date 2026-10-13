import "server-only";
import { actionLock, variantGate } from "./access";
import { objectKey, posterUrl } from "./avatars";
import { fileUrl } from "./storage";
import type { AvatarDef, PlayerManifest, VariantKey, Viewer } from "./types";
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
