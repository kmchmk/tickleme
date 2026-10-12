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

Local development without any keys: `npm run dev` uses an in-memory database (pglite) and a fake sign-in (`/api/dev/login?u=name`).

## Tests
`npm test` (access rules, payment verification). The end-to-end checks used during development ran against `next dev`.

## Adding or replacing videos (ingest)
The generator uploads a set of clips (`NN-name.mp4`, `idle-<name>.mp4`, a still) to the **inbox** bucket (`avatars-inbox`), one folder per set, e.g. `avatars/woman-in-jeans/`. Then:
1. Check the clips: same size, perfect cycle (last frame == first frame), numerically, not by watching.
2. Move them to where they belong with `node scripts/bucket.mjs mv avatars-inbox avatars-free|avatars-private avatars/<set>/ '<poster regex>'`: jeans -> public; bikini/explicit -> private. Make a public poster (blurred for explicit) in `avatars-free`.
3. Update the variant in `scripts/gen-avatar-manifest.py`, run it, bump the variant's `version` (browsers cache clips), commit.
For a new avatar: copy the avatar JSON, change `id`, `name`, `set`s.

Credentials for `scripts/bucket.mjs` are created per task and revoked afterwards.

## Regenerating the manifest
`python3 scripts/gen-avatar-manifest.py` (touch areas are percentages of the 480x720 frame; the subject's right is on the screen's left).
