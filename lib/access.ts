// Pure access rules (no imports besides types) so they can be unit-tested directly.
import type { ActionDef, AvatarDef, Product, Tier, VariantDef, VariantKey, Viewer } from "./types";

export type Need = "taps" | "explicit";

/** Does the viewer own what is needed for this avatar? (the bundle covers both) */
export function owns(viewer: Viewer, avatarId: string, need: Need): boolean {
  return viewer.owned.includes(`${need}:${avatarId}`) || viewer.owned.includes(`bundle:${avatarId}`);
}

export type Gate = { ok: true } | { ok: false; reason: "signin" | "age" | "purchase" };

/** May this viewer open this variant at all? */
export function variantGate(avatarId: string, variant: Pick<VariantDef, "access">, viewer: Viewer): Gate {
  if (variant.access === "guest") return { ok: true };
  if (!viewer.signedIn) return { ok: false, reason: "signin" };
  if (!viewer.ageConfirmed) return { ok: false, reason: "age" };
  if (variant.access === "paid" && !owns(viewer, avatarId, "explicit")) return { ok: false, reason: "purchase" };
  return { ok: true };
}

/** Within an open variant: is this tap location locked, and by which unlock? */
export function actionLock(avatarId: string, action: ActionDef, viewer: Viewer): "taps" | undefined {
  if (action.tier === "taps" && !owns(viewer, avatarId, "taps")) return "taps";
  return undefined;
}

/** Which products make sense to offer for a gate / lock? */
export function offeredProducts(avatar: Pick<AvatarDef, "id">, need: Need, viewer: Viewer): Product[] {
  const out: Product[] = [need];
  const other: Need = need === "taps" ? "explicit" : "taps";
  // The bundle only makes sense while the other half is still missing.
  if (!owns(viewer, avatar.id, other)) out.push("bundle");
  return out;
}

/** Can the viewer still buy this product (i.e. do they not already own it)? */
export function canBuy(viewer: Viewer, avatarId: string, product: Product): boolean {
  if (product === "bundle") return !(owns(viewer, avatarId, "taps") && owns(viewer, avatarId, "explicit"));
  return !owns(viewer, avatarId, product);
}

export function priceMicro(avatar: AvatarDef, product: Product): number {
  return Math.round(avatar.pricing[product] * 1_000_000);
}

export const VARIANT_KEYS: VariantKey[] = ["jeans", "bikini", "explicit"];
export const isVariantKey = (v: string): v is VariantKey => (VARIANT_KEYS as string[]).includes(v);
export const isProduct = (p: string): p is Product => p === "taps" || p === "explicit" || p === "bundle";
export type { Tier };
