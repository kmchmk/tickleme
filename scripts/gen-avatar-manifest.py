#!/usr/bin/env python3
"""Writes content/avatars/<id>.json: avatars with three variants each.

Touch zones: 35 per outfit, as fractions of the 1024x1536 reference still
(x, y, w, h; origin top-left). The subject's right is the screen's left. All outfits
share pose and framing, so the same zones fit every outfit. The player's frame is
480x720 (same 2:3 ratio), so fractions map straight to percentages.

Zones 33-35 (right breast, left breast, groin) are payment-locked (tier "taps", needs the
"more tap locations" unlock) in the jeans and bikini outfits; in the explicit outfit
everything is covered by the explicit unlock. Where zones overlap, the locked one wins
(it is drawn last, so it sits on top).

Clips live in the Neon storage buckets (public: avatars-free, private: avatars-private)
under avatars/<set>/<NN>-<name>.mp4. Posters are always public; the explicit poster must
be a BLURRED teaser. PLACEHOLDER maps each zone to the older clip it was copied from
until the real clip is generated (see scripts/placeholder-clips.mjs).
"""
import json
import os

def R(x, y, w, h): return {"shape": "rect", "x": round(x * 100, 2), "y": round(y * 100, 2), "w": round(w * 100, 2), "h": round(h * 100, 2)}

# The hand-drawn reference zones (fractions of the reference still). Used as the fallback and as the
# names/labels/placeholders; each outfit's real boxes come from content/zones/<set>.json, which
# scripts/gen-zones.py computes from the outfit's own body landmarks.
ZONES = [(z["n"], z["name"], z["label"], tuple(z["box"]), z["placeholder"], z["locked"]) for z in json.load(open("scripts/reference-zones.json"))]
LOCKED = {n for n, *_, locked in ZONES if locked}

def clip(n, name): return f"{n:02d}-{name}"

def draw_order(z):
    # Locked zones on top; otherwise bigger zones first so small, precise ones stay tappable.
    n, name, label, (x, y, w, h), src, locked = z
    return (locked, -w * h)

def zone_boxes(set_):
    path = f"content/zones/{set_}.json"
    if not os.path.exists(path):
        print(f"warning: no computed zones for {set_}, using the reference zones")
        return {name: box for n, name, label, box, src, locked in ZONES}
    return {k: tuple(v) for k, v in json.load(open(path)).items()}

def variant(set_, bucket, access, idle, poster, version, tier_of):
    boxes = zone_boxes(set_)
    acts = sorted([(n, name, label, boxes[name], src, locked) for n, name, label, box, src, locked in ZONES], key=draw_order)
    return {
        "set": set_, "bucket": bucket, "access": access, "idle": idle, "poster": poster,
        "aspectRatio": round(480 / 720, 4), "version": version,
        "actions": [
            {"id": clip(n, name), "label": label, "video": f"{clip(n, name)}.mp4", "region": R(*box), "tier": tier_of(n)}
            for n, name, label, box, src, locked in acts
        ],
    }

def make(id_, name, jeans, bikini, nude):
    """Each argument is (set folder, version)."""
    return {
        "id": id_,
        "name": name,
        "pricing": {"taps": 0.69, "explicit": 0.69, "bundle": 0.99},   # USDC
        "variants": {
            "jeans": variant(jeans[0], "public", "guest", "idle-jeans.mp4", "poster.jpg", jeans[1], lambda n: "taps" if n in LOCKED else "free"),
            "bikini": variant(bikini[0], "private", "member", "idle-bikini.mp4", "poster.jpg", bikini[1],
                              lambda n: "taps" if n in LOCKED else "free"),
            "explicit": variant(nude[0], "private", "paid", "idle-nude.mp4", "web/poster.png", nude[1], lambda n: "explicit"),
        },
    }

AVATARS = [
    make("avatar-1", "Avatar 1", ("woman-in-jeans", 5), ("woman-in-bikini", 7), ("woman-in-nude", 3)),
    make("avatar-2", "Avatar 2", ("white-woman-in-jeans", 3), ("white-woman-in-bikini", 3), ("white-woman-in-nude", 3)),
    make("avatar-3", "Avatar 3", ("black-woman-in-jeans", 3), ("black-woman-in-bikini", 3), ("black-woman-in-nude", 3)),
]
for avatar in AVATARS:
    open(f"content/avatars/{avatar['id']}.json", "w").write(json.dumps(avatar, indent=2) + "\n")
    print(avatar["id"], {k: (len(v["actions"]), sum(a["tier"] == "free" for a in v["actions"])) for k, v in avatar["variants"].items()}, "(actions, free)")

# Which older clip stands in for each zone until its real clip exists (read by scripts/placeholder-clips.mjs).
open("content/placeholder-clips.json", "w").write(json.dumps({clip(n, name): src for n, name, label, box, src, locked in ZONES}, indent=2) + "\n")
