import demo from "@/content/avatars/demo.json";
import type { AvatarManifest } from "./types";

const avatars = [demo] as AvatarManifest[];

export const getAvatars = () => avatars;
export const getAvatar = (id: string) => avatars.find((a) => a.id === id);
export const assetUrl = (avatar: AvatarManifest, file: string) =>
  `/avatars/${avatar.id}/${file}`;
