# Tickle Me

Interactive avatars: an idle video sits on top of ~20 short action clips. Tap a body part and the matching clip plays, then the idle returns. Taps work instantly at any time (the visible frame is frozen on a canvas while the new clip starts underneath).

## Product rules
One **avatar** (`content/avatars/avatar-1.json`) has three **variants** ("outfits"):

| Variant | Who can open it | Tap locations |
|---|---|---|
| jeans | everyone | all free |
| bikini | signed-in members who confirmed "I'm 18+" | 10 free, 10 need the **taps** unlock |
| explicit | signed-in 18+ members who bought **explicit** (or the **bundle**) | all (covered by the unlock) |

Products are bought per avatar, with USDC on Solana: `taps`, `explicit`, `bundle` (= both). No credits/balances. Prices are in `content/avatars/avatar-1.json` (`pricing`).
Access rules live in `lib/access.ts` (pure, unit-tested). The server never sends a clip the viewer may not play: locked tap locations have no URL at all.

## Architecture (all free tiers)
- **Next.js on Vercel.** NOTE: Vercel's Hobby plan is for non-commercial use only. Upgrade (Pro) or move hosts before charging money.
- **Sign-in: Clerk** (email one-time code; email link needs a custom domain). On `*.vercel.app` Clerk runs through its built-in `/__clerk` proxy (no DNS), which is why `proxy.ts` routes that path. Without its keys the site is guest-only.
- **Database: Neon Postgres**: `profiles` (age confirmation), `orders`, `entitlements` (`db/schema.sql`). The app uses the restricted role `tickleme_app` (select/insert/update only).
- **Buckets: Neon storage**
  - `avatars-free` (public): jeans clips + every poster. The explicit poster is a *blurred* teaser.
  - `avatars-private`: bikini and explicit clips. Handed out only as 15-minute signed links after an access check.
  - `avatars-inbox` (private): landing zone for the video generator (see below).
- **Payments: Solana Pay, USDC.** An order has a unique reference key; a wallet pays the recipient. The server checks the chain (`lib/solana-verify.ts`: right token, right recipient, at least the price, reference present, finalized), then grants the entitlement in one atomic SQL statement. A payment is never counted twice (unique transaction signature) and late payments are still honoured. No cards.
- Cached clips live in the browser's IndexedDB (private ones are wiped on sign-out).

## Environment variables (Vercel)
| Variable | What |
|---|---|
| `NEXT_PUBLIC_ASSET_BASE_URL` | public bucket base, `https://<endpoint>/avatars-free` |
| `NEON_S3_ENDPOINT`, `NEON_S3_REGION`, `NEON_S3_ACCESS_KEY_ID`, `NEON_S3_SECRET_ACCESS_KEY` | read-only storage credential (signs links to private clips) |
| `DATABASE_URL` | Neon connection string for the `tickleme_app` role |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk (enables sign-in) |
| `SOLANA_RECIPIENT` | the wallet address that receives USDC (public key only) |
| `SOLANA_RPC_URL` | optional but recommended (e.g. a free Helius key); defaults to the public RPC, which rate-limits |
| `USDC_MINT` | optional, defaults to mainnet USDC |
| `PAYMENTS_MOCK=1` | local development only: adds a fake "pay" button. Ignored in production |
| `ALLOWED_ADMIN_EMAILS` | comma-separated emails that may open `/admin` |
| `NEXT_PUBLIC_SITE_URL` | the public address, currently `https://www.tickleme.baby` (canonical links, sitemap, link previews). Falls back to Vercel's production URL |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | optional: the code from Google Search Console's "HTML tag" method |

Local development without any keys: `npm run dev` uses an in-memory database (pglite) and a fake sign-in (`/api/dev/login?u=name`).

## Payments
Buyers pay USDC on Solana. A payment counts once the network has **confirmed** it (about a second).
- **Wallet apps (Solana Pay):** the QR code / "Open in wallet app" link carries a unique reference key per order; the
  server finds the transaction by it and checks that the recipient's USDC balance went up by at least the price.
- **Exchanges / plain transfers:** "Paying from an exchange or another app?" gives the order a unique *exact* amount
  (price + a few millionths). Transfers into the recipient's USDC account with that exact amount are matched to it.
- Late payments are still honoured: pending orders of the last 24 h are re-checked whenever the buyer comes back.
- `/admin` → Overview → **Setup** checks the wallet, its USDC account and the RPC live.

Setup: set `SOLANA_RECIPIENT` to your wallet's public address and `SOLANA_RPC_URL` to a dedicated RPC (Helius free
tier: `https://mainnet.helius-rpc.com/?api-key=…`). The public endpoint works but rate-limits.

## Custom domain and SEO
1. Vercel → Project → Settings → Domains: add the domain and set it as the primary one; let `tickleme.vercel.app`
   redirect to it (308).
2. Set `NEXT_PUBLIC_SITE_URL=https://<domain>` and redeploy.
3. Clerk → Domains: switch the production instance to the new domain (add the DNS records Clerk lists); the
   `/__clerk` proxy is only needed while on `vercel.app`. Update allowed redirect URLs.
4. Google Search Console: add the domain, verify (DNS, or `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`), submit
   `https://<domain>/sitemap.xml`.

Built in: per-page titles/descriptions, canonical URLs (outfit `?v=` links fold into the avatar page), Open Graph and
Twitter cards (generated home image, poster per avatar), `sitemap.xml`, `robots.txt` (admin/api/join excluded,
previews not indexed), JSON-LD (WebSite, ItemList, FAQPage) with a visible FAQ, and `rating: adult` because some
outfits are adult-only.

## Tests
`npm test` (access rules, payment verification). The end-to-end checks used during development ran against `next dev`.

## Adding or replacing videos (ingest)
The generator uploads a set of clips (`NN-name.mp4`, `idle-<name>.mp4`, a still) to the **inbox** bucket (`avatars-inbox`), one folder per set, e.g. `avatars/woman-in-jeans/`. Then:
1. Check the clips: same size, perfect cycle (last frame == first frame), numerically, not by watching.
2. Move them to where they belong with `node scripts/bucket.mjs mv avatars-inbox avatars-free|avatars-private avatars/<set>/ '<poster regex>'`: jeans -> public; bikini/explicit -> private. Make a public poster (blurred for explicit) in `avatars-free`.
3. Add the outfit to `scripts/gen-avatar-manifest.py`, then compute its touch zones from its own body proportions (no hand placement):
   `node scripts/idle-frames.mjs frames/` (idle frame per outfit), `python3 scripts/gen-zones.py build frames/`
   (pose model finds landmarks; rules in `scripts/zone-rules.json`), then run the manifest generator, bump the variant's `version`
   (browsers cache clips), commit. `gen-zones.py check frames/ out/` draws the zones on the frames for a quick look.
   Missing clips can be filled with nearby copies: `node scripts/placeholder-clips.mjs`.
For a new avatar: copy the avatar JSON, change `id`, `name`, `set`s.

Credentials for `scripts/bucket.mjs` are created per task and revoked afterwards.

## Regenerating the manifest
`python3 scripts/gen-avatar-manifest.py` (touch areas are percentages of the 480x720 frame; the subject's right is on the screen's left).

## Outfit transitions

Switching outfit plays short clips between the two pictures: jeans → bikini plays `01`, `02`; bikini → explicit plays `03`, `04`
(for the south Indian avatar: `01-saree-off-top`, `02-saree-off-bottom`, `03-bra-off`, `04-panties-off`). Going back plays the
**reversed** clips (`back-02…`, `back-01…`; `back-04…`, `back-03…`), made with `ffmpeg -vf reverse` until real ones are generated.

- A pair belongs to its **lower** outfit and lives in `<set>/transitions/` of that outfit's bucket: jeans ↔ bikini in the jeans set
  (public), bikini ↔ explicit in the bikini set (private, signed links). Whoever may open that outfit may play the pair.
- `scripts/transitions.json` lists each set's `up` / `down` files; `scripts/gen-avatar-manifest.py` puts them in the manifest
  (bump `TRANSITION_VERSION` after replacing clips so browsers drop their cached copies).
- To replace the reversed clips with real ones, upload them with the same names (`back-02-…`, …) and re-run the manifest generator.
- While the explicit outfit is blurred for the viewer, the bikini ↔ explicit clips gradually blur (or un-blur) to the teaser's level.
  That level is measured per outfit by `scripts/measure-blur.py` → `scripts/blur-levels.json` → the explicit variant's `blur`.
- The avatar page downloads everything the viewer may see up front (`/api/avatars/<id>` returns all outfits + transitions in one
  request), so switching never shows a loading state. The home page does the same for the transition clips in the background
  (`/api/transitions`).

## Admin (`/admin`)

Only emails listed in `ALLOWED_ADMIN_EMAILS` (comma separated, set in Vercel) can open it; everyone else gets the normal "not found".
Admins can grant or remove the paid access levels (More tap locations, Explicit avatar, Bundle) per user and avatar, and give access to
an email address that has not signed up yet (saved, and the person is invited with Clerk; it applies at their first sign-in).
Access given here is stored with `source = 'admin'`, shown separately from paid access, and only admins can remove it.
Every change is written to `admin_audit`. Tables: `entitlements.source/granted_by/note`, `pending_grants`, `grant_checks`, `admin_audit`
(see `db/schema.sql`; production was migrated with the same statements).
Local development without Clerk: `ALLOWED_ADMIN_EMAILS=alice@dev.local`, sign in with `/api/dev/login?u=alice`.
