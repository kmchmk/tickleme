/** A clickable area, in percent (0-100) of the idle frame. */
export type Region =
  | { shape: "rect"; x: number; y: number; w: number; h: number }
  | { shape: "polygon"; points: [number, number][] };

export interface AvatarAction {
  id: string;
  label: string;
  /** Filename inside /public/avatars/<avatar id>/ . Must start AND end on the idle frame. */
  video: string;
  region: Region;
}

export interface AvatarManifest {
  id: string;
  name: string;
  /** Reserved for the future paywall. Free avatars have premium: false. */
  premium: boolean;
  /** width / height of every clip (all clips must share it). */
  aspectRatio: number;
  /** Looping, near-motionless clip shown on top when nothing is happening. */
  idle: string;
  /** Optional still of the idle frame shown while clips load. */
  poster?: string;
  actions: AvatarAction[];
}
