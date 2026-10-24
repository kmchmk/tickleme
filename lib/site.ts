/**
 * The site's public address, used for canonical links, the sitemap and link previews. Set NEXT_PUBLIC_SITE_URL to
 * the custom domain (https://example.com); without it, Vercel's production address is used, then localhost.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
  "http://localhost:3000"
).replace(/\/$/, "");

export const SITE_NAME = "Tickle Me";
export const TAGLINE = "Interactive avatars you can tap";
export const DESCRIPTION =
  "Tickle Me is a playful tickle game with interactive video avatars. Tap a cheek, poke the ribs or tickle the feet: every spot gets its own laugh, squirm or reaction. Free to play in your browser, best on your phone.";

/** The home page introduction (visible text, so search engines and first-time visitors know what this is). */
export const INTRO: string[] = [
  "Tickle Me is a tickle game you play with your fingertips. Each avatar is a real video character with around 25 touch spots, from the forehead and cheeks to the ribs, underarms and feet, and every spot has its own reaction: a giggle, a squirm, a dodge or a funny face.",
  "Pick an avatar, tap anywhere and see what happens. Not sure where to start? Turn on the hints to see every touch spot. It runs right in your browser, on your phone or computer, with nothing to install.",
];

export const FAQ: { q: string; a: string }[] = [
  { q: "How do I play?", a: "Open an avatar and tap anywhere on them. Each touch spot plays its own reaction. Tap the hints button to see where all the spots are, and switch outfits with the buttons at the top." },
  {
    q: "What is Tickle Me?",
    a: "A collection of interactive video avatars. Tap anywhere on an avatar and it reacts with its own short clip: each spot gets a different reaction.",
  },
  { q: "Is it free?", a: "Yes. Every avatar can be played for free. Extra tap locations and some outfits can be unlocked with a small one-off payment." },
  {
    q: "How do I pay?",
    a: "With USDC on the Solana network, from any Solana wallet app (Phantom, Solflare and others) or from an exchange. Unlocks are instant and permanent, with no subscription.",
  },
  { q: "Do I need an account?", a: "No account is needed to play. Signing in with your email (a one-time code, no password) keeps your unlocks on every device." },
  { q: "Are there other outfits?", a: "Yes. Besides the everyday outfit everyone can play, some avatars have extra outfits for members. Those are only shown after signing in and confirming you are 18 or older." },
];
