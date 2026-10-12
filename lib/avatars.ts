import womanInJeans from "@/content/avatars/woman-in-jeans.json";
import womanInBikini from "@/content/avatars/woman-in-bikini.json";
import womanInNude from "@/content/avatars/woman-in-nude.json";
import type { AvatarManifest } from "./types";

const avatars = [womanInJeans, womanInBikini, womanInNude] as AvatarManifest[];

/** Where clips are hosted, e.g. https://<store>.public.blob.vercel-storage.com. Empty = /public. */
const ASSET_BASE = (process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? "").replace(/\/$/, "");

export const getAvatars = () => avatars;
/** Avatars that can actually be opened (locked ones are teasers only). */
export const getPlayableAvatars = () => avatars.filter((a) => !a.locked);
export const getAvatar = (id: string) => avatars.find((a) => a.id === id && !a.locked);
export const assetUrl = (avatar: AvatarManifest, file: string) =>
  `${ASSET_BASE}/avatars/${avatar.id}/${file}`;
