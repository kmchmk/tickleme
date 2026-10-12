import womanInJeans from "@/content/avatars/woman-in-jeans.json";
import womanInBikini from "@/content/avatars/woman-in-bikini.json";
import type { AvatarManifest } from "./types";

const avatars = [womanInJeans, womanInBikini] as AvatarManifest[];

/** Where clips are hosted, e.g. https://<store>.public.blob.vercel-storage.com. Empty = /public. */
const ASSET_BASE = (process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? "").replace(/\/$/, "");

export const getAvatars = () => avatars;
export const getAvatar = (id: string) => avatars.find((a) => a.id === id);
export const assetUrl = (avatar: AvatarManifest, file: string) =>
  `${ASSET_BASE}/avatars/${avatar.id}/${file}`;

/** Teaser cards shown on the home page until these avatars exist. */
export const comingSoon = [
  { name: "Mochi the Kitten", emoji: "🐱" },
  { name: "Biscuit the Puppy", emoji: "🐶" },
  { name: "Clover the Bunny", emoji: "🐰" },
];
