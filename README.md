# Tickle Me

Interactive avatar: an idle video sits on top of several short action clips. Tap a body part and the matching clip plays, then the idle video returns on the identical frame.

## Adding an avatar
1. Make the clips (same resolution, H.264 mp4, no audio, 1–3 s). Action clips must start and end on the idle frame. Clips are **not** committed; they live in the public Neon storage bucket `avatars-free` (Neon project `tickleme`, branch `main`) under `avatars/<id>/`. Upload with `scripts/upload-avatar.mjs` (see header for env vars). The Vercel env `NEXT_PUBLIC_ASSET_BASE_URL` points at `https://<branch>.storage.<region>.aws.neon.tech/avatars-free`; without it, clips are read from `public/avatars/<id>/`.
2. Add `content/avatars/<id>.json` (see `demo.json`) and register it in `lib/avatars.ts`.
3. Region coordinates are percentages of the frame. Open `/a/<id>?debug=1` to see the hit areas.

`premium: true` is reserved for the future paywall (gate in `app/a/[id]/page.tsx`).

## Dev / deploy
`npm run dev`, `npm run build`. Deploy by importing the GitHub repo in Vercel (framework auto-detected).
