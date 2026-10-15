#!/usr/bin/env python3
"""How blurred is each explicit outfit's teaser? Finds the Gaussian blur (as a fraction of the picture width) that turns the
outfit's own idle frame into its public teaser, so the transition into the blurred state can match it.

  node scripts/idle-frames.mjs frames/ && python3 scripts/measure-blur.py frames/   -> scripts/blur-levels.json
Needs pillow + numpy; teasers are fetched from the public bucket (NEXT_PUBLIC_ASSET_BASE_URL).
"""
import glob, io, json, os, sys, urllib.request
import numpy as np
from PIL import Image, ImageFilter

frames = sys.argv[1]
base = os.environ["NEXT_PUBLIC_ASSET_BASE_URL"].rstrip("/")
out = {}
for f in sorted(glob.glob("content/avatars/*.json")):
    a = json.load(open(f))
    v = a["variants"]["explicit"]
    sharp = Image.open(f"{frames}/{v['set']}.png").convert("L").resize((480, 720))
    teaser = Image.open(io.BytesIO(urllib.request.urlopen(f"{base}/avatars/{v['set']}/{v['poster']}").read())).convert("L").resize((480, 720))
    t = np.asarray(teaser, float)
    best = min(((np.mean((np.asarray(sharp.filter(ImageFilter.GaussianBlur(s)), float) - t) ** 2), s) for s in range(4, 64, 2)))
    out[v["set"]] = round(best[1] / 480, 4)
    print(f"{v['set']:34s} sigma {best[1]:2d}px of 480  -> {out[v['set']]}")
json.dump(out, open("scripts/blur-levels.json", "w"), indent=1)
