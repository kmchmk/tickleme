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
  "Tap a nose, poke a belly, tickle an ear: Tickle Me is a playful collection of interactive video avatars that react to every touch. Free to try, best on your phone.";

export const FAQ: { q: string; a: string }[] = [
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
  { q: "Is it for adults?", a: "Some outfits are for adults only. They are hidden until you sign in and confirm you are 18 or older." },
];
