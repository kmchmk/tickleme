/** A clickable area, in percent (0-100) of the idle frame. */
export type Region =
  | { shape: "rect"; x: number; y: number; w: number; h: number }
  | { shape: "polygon"; points: [number, number][] };

export type VariantKey = "jeans" | "bikini" | "explicit";

/** What a viewer can buy. `bundle` = `taps` + `explicit` for one avatar. */
export type Product = "taps" | "explicit" | "bundle";

/**
 * Who may play a tap location:
 *  - free:     anyone who can open the variant
 *  - taps:     needs the "more tap locations" unlock (or the bundle)
 *  - explicit: part of the explicit variant (covered by its unlock)
 */
export type Tier = "free" | "taps" | "explicit";

/** Who may open a variant: anybody, signed-in 18+ members, or paying 18+ members. */
export type VariantAccess = "guest" | "member" | "paid";

export interface ActionDef {
  id: string;
  label: string;
  /** File name inside the variant's folder. Must start and end on the idle frame. */
  video: string;
  /** One or more areas that trigger this clip (e.g. both ears). */
  region: Region | Region[];
  /** The zone's border as SVG path data (percent units); drawn dashed when touch spots are shown. */
  outline: string;
  tier: Tier;
}

export interface VariantDef {
  /** Outfit name shown on the chip/tab when it isn't the default (Jeans / Bikini / Explicit). */
  label?: string;
  /** Folder under avatars/ in the bucket, e.g. "woman-in-jeans". */
  set: string;
  /** Where the clips live. Private clips are only handed out as short-lived signed links. */
  bucket: "public" | "private";
  access: VariantAccess;
  /** Looping, near-motionless clip shown when nothing is happening. */
  idle: string;
  /** Still of the idle frame. Always public: for explicit variants it MUST be a blurred teaser. */
  poster: string;
  /** width / height of every clip. */
  aspectRatio: number;
  /** Bump after replacing clips so browsers drop their IndexedDB copies. */
  version: number;
  actions: ActionDef[];
}

export interface AvatarDef {
  id: string;
  name: string;
  /** Prices in USDC. */
  pricing: Record<Product, number>;
  variants: Record<VariantKey, VariantDef>;
}

/* ---------- what the API sends to the player ---------- */

export interface PlayerAction {
  id: string;
  label: string;
  region: Region | Region[];
  outline: string;
  /** Absent while locked: the server never sends a clip the viewer may not play. */
  url?: string;
  /** Stable cache key (the URL is signed and changes every request). */
  key: string;
  /** Set when locked: which unlock opens it. */
  locked?: "taps";
}

export interface PlayerManifest {
  avatarId: string;
  variant: VariantKey;
  name: string;
  aspectRatio: number;
  version: number;
  idle: { url: string; key: string };
  poster: string;
  actions: PlayerAction[];
}

/** Everything the UI needs to know about the signed-in (or guest) viewer. */
export interface Viewer {
  signedIn: boolean;
  ageConfirmed: boolean;
  /** Purchased products as "<product>:<avatarId>". */
  owned: string[];
}
