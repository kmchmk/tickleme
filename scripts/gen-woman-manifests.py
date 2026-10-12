#!/usr/bin/env python3
"""Writes content/avatars/woman-in-{jeans,bikini}.json.

Touch areas are percentages of the 480x832 frame. Sides are the subject's own
(her right is on the screen's left). Each entry: (id, label, file, box) where box
is the screen-left box (x, y, w, h); `mirror` boxes are reflected about x=50.
"""
import json

def R(x, y, w, h): return {"shape": "rect", "x": x, "y": y, "w": w, "h": h}
def mirror(b): return R(round(100 - b[0] - b[2], 2), b[1], b[2], b[3])

# (n, name, screen-left box for the subject's right side)
PAIRS = [
    (1, "hand", (27, 52, 8, 9)),
    (3, "forearm", (27.5, 41, 6.5, 11)),
    (5, "shoulder", (30, 18.5, 12, 5)),
    (9, "underarm", (31, 24, 7, 8)),
    (12, "ribs", (38, 32.5, 7, 8)),
    (15, "hip", (34.5, 42, 9.5, 8.5)),
    (17, "thigh", (34, 51, 14, 18)),
    (19, "foot", (41, 87.5, 8, 9)),
]
CENTER = [
    (7, "neck", "Neck", [R(45.5, 16, 9, 4)]),
    (8, "cheek", "Cheek", [R(44, 12.5, 5, 4), R(51, 12.5, 5, 4)]),
    (11, "belly", "Belly", [R(44, 34, 12, 12)]),
    (14, "upper-chest", "Upper chest", [R(41, 20, 18, 5.5)]),
]

def actions():
    out = {}
    for n, name, box in PAIRS:
        for i, side in ((n, "right"), (n + 1, "left")):
            b = R(*box) if side == "right" else mirror(box)
            out[i] = (f"{i:02d}-{side}-{name}", f"{side.capitalize()} {name}", b)
    for n, name, label, boxes in CENTER:
        out[n] = (f"{n:02d}-{name}", label, boxes if len(boxes) > 1 else boxes[0])
    return [out[i] for i in sorted(out)]

# Draw order: later entries sit on top, so small/precise areas come last.
PRIORITY = ["thigh", "foot", "hip", "belly", "ribs", "forearm", "hand", "underarm", "shoulder", "upper-chest", "neck", "cheek"]
def order(a):
    name = a[0].split("-", 1)[1]
    key = next(k for k in PRIORITY if name.endswith(k))
    return PRIORITY.index(key)

# Per-avatar file layout.
#  - jeans: the generator now delivers perfect cycles (last frame == first frame),
#    so the original files are played directly (no processing, no web/ copies).
#  - bikini: still the blended web/ copies until its clips are replaced as well.
AVATARS = {
    "woman-in-jeans": dict(
        name="Woman in Jeans", aspect=480 / 720, prefix="",
        idle="idle-jeans.mp4", poster="poster.jpg", version=3,
    ),
    "woman-in-bikini": dict(
        name="Woman in Bikini", aspect=480 / 832, prefix="web/",
        idle="web/idle.mp4", poster="web/poster.jpg", version=2,
    ),
}
for id_, cfg in AVATARS.items():
    acts = sorted(actions(), key=order)
    manifest = {
        "id": id_, "name": cfg["name"], "premium": False, "version": cfg["version"],
        "aspectRatio": round(cfg["aspect"], 4),
        "idle": cfg["idle"], "poster": cfg["poster"],
        "actions": [{"id": f, "label": l, "video": f"{cfg['prefix']}{f}.mp4", "region": r} for f, l, r in acts],
    }
    open(f"content/avatars/{id_}.json", "w").write(json.dumps(manifest, indent=2) + "\n")
    print(id_, len(acts), "actions")
