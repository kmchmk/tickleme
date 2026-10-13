#!/usr/bin/env python3
"""Writes content/avatars/<id>.json: avatars with three variants each.

Touch areas are percentages of the 480x720 frame. Sides are the subject's own
(her right is on the screen's left): each pair is defined for the screen-left
box and mirrored about x=50 for the other side.

Who can play what (see lib/access.ts):
  jeans    guests; every tap location is free
  bikini   signed-in 18+ members; the 20 standard tap locations are free, the
           three EXTRA ones (breasts, private area) need the "more tap locations"
           unlock (tier "taps")
  explicit signed-in 18+ members who bought the explicit unlock (or the bundle)

Clips live in the Neon storage buckets (public: avatars-free, private:
avatars-private) under avatars/<set>/. Posters are always public; the explicit
poster must be a BLURRED teaser.
"""
import json

def R(x, y, w, h): return {"shape": "rect", "x": x, "y": y, "w": w, "h": h}
def mirror(b): return R(round(100 - b[0] - b[2], 2), b[1], b[2], b[3])

PAIRS = [  # (first clip number, name, screen-left box for the subject's right side)
    (1, "hand", (27, 52, 8, 9)),
    (3, "forearm", (27.5, 41, 6.5, 11)),
    (5, "shoulder", (30, 18.5, 12, 5)),
    (9, "underarm", (31, 24, 7, 8)),
    (12, "ribs", (38, 32.5, 7, 8)),
    (15, "hip", (34.5, 42, 9.5, 8.5)),
    (17, "thigh", (34, 51, 14, 18)),
    (19, "foot", (41, 87.5, 8, 9)),
]
CENTER = [  # (clip number, name, label, boxes)
    (7, "neck", "Neck", [R(45.5, 16, 9, 4)]),
    (8, "cheek", "Cheek", [R(44, 12.5, 5, 4), R(51, 12.5, 5, 4)]),
    (11, "belly", "Belly", [R(44, 34, 12, 12)]),
    (14, "upper-chest", "Upper chest", [R(41, 19.5, 18, 3.5)]),
]
# Extra tap locations that exist only in the bikini variant (paid). Clip files are
# 21-right-breast.mp4, 22-left-breast.mp4, 23-private-area.mp4 (placeholders until
# the real clips are generated: overwrite the same keys in the private bucket).
EXTRAS = [  # (clip number, id suffix, label, boxes)
    (21, "right-breast", "Right breast", [R(39, 22.5, 11, 9)]),
    (22, "left-breast", "Left breast", [R(50, 22.5, 11, 9)]),
    (23, "private-area", "Private area", [R(44.5, 46.5, 11, 6.5)]),
]
EXTRA_NUMBERS = {n for n, *_ in EXTRAS}
def actions(extras=False):
    out = {}
    for n, name, box in PAIRS:
        for i, side in ((n, "right"), (n + 1, "left")):
            b = R(*box) if side == "right" else mirror(box)
            out[i] = (i, f"{i:02d}-{side}-{name}", f"{side.capitalize()} {name}", b)
    for n, name, label, boxes in CENTER:
        out[n] = (n, f"{n:02d}-{name}", label, boxes if len(boxes) > 1 else boxes[0])
    if extras:
        for n, name, label, boxes in EXTRAS:
            out[n] = (n, f"{n:02d}-{name}", label, boxes if len(boxes) > 1 else boxes[0])
    return [out[i] for i in sorted(out)]

# Draw order: later entries sit on top, so small/precise areas come last.
PRIORITY = ["thigh", "foot", "hip", "belly", "ribs", "forearm", "hand", "underarm", "shoulder", "upper-chest", "neck", "cheek", "breast", "private-area"]
def order(a):
    name = a[1].split("-", 1)[1]
    return PRIORITY.index(next(k for k in PRIORITY if name.endswith(k)))

def variant(set_, bucket, access, idle, poster, version, tier_of, extras=False):
    acts = sorted(actions(extras), key=order)
    return {
        "set": set_, "bucket": bucket, "access": access, "idle": idle, "poster": poster,
        "aspectRatio": round(480 / 720, 4), "version": version,
        "actions": [{"id": f, "label": l, "video": f"{f}.mp4", "region": r, "tier": tier_of(n)} for n, f, l, r in acts],
    }

def make(id_, name, jeans, bikini, nude):
    """Each argument is (set folder, version)."""
    return {
        "id": id_,
        "name": name,
        "pricing": {"taps": 0.69, "explicit": 0.69, "bundle": 0.99},   # USDC
        "variants": {
            "jeans": variant(jeans[0], "public", "guest", "idle-jeans.mp4", "poster.jpg", jeans[1], lambda n: "free"),
            "bikini": variant(bikini[0], "private", "member", "idle-bikini.mp4", "poster.jpg", bikini[1],
                              lambda n: "taps" if n in EXTRA_NUMBERS else "free", extras=True),
            "explicit": variant(nude[0], "private", "paid", "idle-nude.mp4", "web/poster.png", nude[1], lambda n: "explicit"),
        },
    }

AVATARS = [
    make("avatar-1", "Avatar 1", ("woman-in-jeans", 3), ("woman-in-bikini", 5), ("woman-in-nude", 1)),
    make("avatar-2", "Avatar 2", ("white-woman-in-jeans", 1), ("white-woman-in-bikini", 1), ("white-woman-in-nude", 1)),
]
for avatar in AVATARS:
    open(f"content/avatars/{avatar['id']}.json", "w").write(json.dumps(avatar, indent=2) + "\n")
    print(avatar["id"], {k: (len(v["actions"]), sum(a["tier"] == "free" for a in v["actions"])) for k, v in avatar["variants"].items()}, "(actions, free)")
