import demo from "@/content/avatars/demo.json";
import type { AvatarManifest } from "./types";

const avatars = [demo] as AvatarManifest[];

/** Where clips are hosted, e.g. https://<store>.public.blob.vercel-storage.com. Empty = /public. */
const ASSET_BASE = (process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? "").replace(/\/$/, "");

export const getAvatars = () => avatars;
export const getAvatar = (id: string) => avatars.find((a) => a.id === id);
export const assetUrl = (avatar: AvatarManifest, file: string) =>
  `${ASSET_BASE}/avatars/${avatar.id}/${file}`;
