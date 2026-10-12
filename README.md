# Tickle Me

Interactive avatar: an idle video sits on top of several short action clips. Tap a body part and the matching clip plays, then the idle video returns on the identical frame.

## Adding an avatar
1. Make the clips (same resolution, H.264 mp4, no audio, 1–3 s). Action clips must start and end on the idle frame. Clips are **not** committed; they live in the public Neon storage bucket `avatars-free` (Neon project `tickleme`, branch `main`) under `avatars/<id>/`. Upload with `scripts/upload-avatar.mjs` (see header for env vars). The Vercel env `NEXT_PUBLIC_ASSET_BASE_URL` points at `https://<branch>.storage.<region>.aws.neon.tech/avatars-free`; without it, clips are read from `public/avatars/<id>/`.
2. Add `content/avatars/<id>.json` (see `woman-in-jeans.json`; `scripts/gen-woman-manifests.py` generates the two woman avatars) and register it in `lib/avatars.ts`.
3. Clips are cached in the browser's IndexedDB. After re-uploading clips for an avatar, bump its `version` in the manifest so browsers re-download them.
4. Region coordinates are percentages of the frame. Open `/a/<id>?debug=1` to see the hit areas.

`premium: true` is reserved for the future paywall (gate in `app/a/[id]/page.tsx`).

## Dev / deploy
`npm run dev`, `npm run build`. Deploy by importing the GitHub repo in Vercel (framework auto-detected).

## Photoreal avatars
- **woman-in-jeans** plays the generator's original files straight from the Neon bucket (`avatars/woman-in-jeans/NN-name.mp4`, `idle-jeans.mp4`, `poster.jpg`): they are perfect cycles (last frame == first frame), so there is no processing step. 480x720.
- **woman-in-bikini** still plays blended copies from `avatars/woman-in-bikini/web/` (the last 12 frames of each clip are blended into the start frame with ffmpeg `blend`, plus a loop-seam blend on the idle) until its clips are replaced with perfect cycles too. When told, move it to the same layout as jeans (`prefix=""` in `scripts/gen-woman-manifests.py`).
- Touch areas come from `scripts/gen-woman-manifests.py` (percent of the frame; the subject's right is on the screen's left). The player fades each tapped clip in over a frozen frame, so taps work instantly at any time.
- After replacing clips in the bucket, bump `version` there so browsers re-download them.
