import avatar1 from "@/content/avatars/avatar-1.json";
import avatar2 from "@/content/avatars/avatar-2.json";
import avatar3 from "@/content/avatars/avatar-3.json";
import avatar4 from "@/content/avatars/avatar-4.json";
import avatar5 from "@/content/avatars/avatar-5.json";
import { PUBLIC_BASE } from "./config";
import { PROFILES } from "./profiles";
import type { AvatarDef, VariantAccess, VariantDef, VariantKey } from "./types";

// Names come from lib/profiles.ts (the generated JSON only carries placeholders).
const avatars = ([avatar1, avatar2, avatar3, avatar4, avatar5] as unknown as AvatarDef[]).map((a) => ({ ...a, name: PROFILES[a.id]?.name ?? a.name }));

export const getAvatars = () => avatars;
export const getAvatar = (id: string) => avatars.find((a) => a.id === id);

/** Where a file of a variant lives in its bucket. */
export const objectKey = (v: VariantDef, file: string) => `avatars/${v.set}/${file}`;

/** Posters are always public (the explicit one is a blurred teaser). */
export const posterUrl = (v: VariantDef) => `${PUBLIC_BASE}/${objectKey(v, v.poster)}`;

/** The small, public-safe description of an avatar that pages and cards need. No clip names. */
export interface AvatarSummary {
  id: string;
  name: string;
  tagline: string;
  bio: string;
  pricing: AvatarDef["pricing"];
  variants: Record<VariantKey, { label?: string; blur?: number; poster: string; aspectRatio: number; access: VariantAccess; total: number; free: number }>;
}

export function summarize(a: AvatarDef): AvatarSummary {
  const variants = Object.fromEntries(
    (Object.keys(a.variants) as VariantKey[]).map((k) => {
      const v = a.variants[k];
      return [k, { label: v.label, blur: v.blur, poster: posterUrl(v), aspectRatio: v.aspectRatio, access: v.access, total: v.actions.length, free: v.actions.filter((x) => x.tier === "free").length }];
    }),
  ) as AvatarSummary["variants"];
  const p = PROFILES[a.id];
  return { id: a.id, name: a.name, tagline: p?.tagline ?? "", bio: p?.bio ?? "", pricing: a.pricing, variants };
}
