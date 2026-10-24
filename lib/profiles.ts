/**
 * The public face of each avatar: name, a one-line tagline and a short description. Shown on the home page and the
 * avatar page, and used for search results and link previews, so keep it family-friendly: it describes the free,
 * everyday outfit and the play, never the locked outfits. (Kept apart from content/avatars/*.json, which a script
 * regenerates.)
 */
export interface Profile {
  name: string;
  tagline: string;
  bio: string;
}

export const PROFILES: Record<string, Profile> = {
  "avatar-1": {
    name: "Maya",
    tagline: "Giggly, ticklish and full of surprises",
    bio: "Maya can't keep a straight face. Poke her ribs, tickle her feet or tap her forehead and every spot gets its own laugh, squirm or playful look. Start in her favourite denim outfit and find out which spot gets the biggest giggle.",
  },
  "avatar-2": {
    name: "Chloe",
    tagline: "Bubbly, cheeky and quick to react",
    bio: "Chloe reacts before you've even finished the tap. Try her cheeks, her shoulders or that famously ticklish stomach and watch her dodge, laugh and pull faces. A great one to start with if you're new.",
  },
  "avatar-3": {
    name: "Amara",
    tagline: "Confident, playful and hard to tickle (almost)",
    bio: "Amara likes to pretend she isn't ticklish. Tap her arms or forehead and she stays cool, but find the right spot on her ribs or feet and the act falls apart. Every touch spot has its own reaction to discover.",
  },
  "avatar-4": {
    name: "Mei",
    tagline: "Shy at first, then all giggles",
    bio: "Mei starts out shy, with a small smile for a tap on the cheek or hand. Keep going, try her underarms, ribs or feet, and the giggles take over. A gentle, sweet avatar with plenty of surprises.",
  },
  "avatar-5": {
    name: "Priya",
    tagline: "Graceful in a saree, wonderfully ticklish",
    bio: "Priya greets you in an elegant saree, all poise and charm, until you find her ticklish spots. Tap her shoulders, her stomach or her feet and her graceful pose melts into laughter.",
  },
};

export const profileOf = (id: string): Profile | undefined => PROFILES[id];
