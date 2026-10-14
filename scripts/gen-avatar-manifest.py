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


# The zone set (names, labels, which are locked, which old clip stands in as a placeholder). Each outfit's
# boxes come from content/zones/<set>.json, which scripts/gen-zones.py computes from the outfit's own
# body landmarks.
ZONES = [(z["n"], z["name"], z["label"], None, z["placeholder"], z["locked"]) for z in json.load(open("scripts/zone-set.json"))]
LOCKED = {n for n, *_, locked in ZONES if locked}

def clip(n, name): return f"{n:02d}-{name}"

def zone_data(set_):
    path = f"content/zones/{set_}.json"
    if not os.path.exists(path):
        raise SystemExit(f"no computed zones for {set_}: run scripts/gen-zones.py build first")
    return json.load(open(path))

def variant(set_, bucket, access, idle, poster, version, tier_of):
    zones = zone_data(set_)
    return {
        "set": set_, "bucket": bucket, "access": access, "idle": idle, "poster": poster,
        "aspectRatio": round(480 / 720, 4), "version": version,
        "actions": [
            {"id": clip(n, name), "label": label, "video": f"{clip(n, name)}.mp4",
             "region": [{"shape": "rect", "x": x, "y": y, "w": w, "h": h} for x, y, w, h in zones[name]["rects"]],
             "outline": zones[name]["outline"], "tier": tier_of(n)}
            for n, name, label, box, src, locked in ZONES
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
    make("avatar-1", "Avatar 1", ("woman-in-jeans", 7), ("woman-in-bikini", 8), ("woman-in-nude", 4)),
    make("avatar-2", "Avatar 2", ("white-woman-in-jeans", 4), ("white-woman-in-bikini", 4), ("white-woman-in-nude", 4)),
    make("avatar-3", "Avatar 3", ("black-woman-in-jeans", 4), ("black-woman-in-bikini", 4), ("black-woman-in-nude", 4)),
    make("avatar-4", "Avatar 4", ("asian-woman-in-jeans", 2), ("asian-woman-in-bikini", 1), ("asian-woman-in-nude", 1)),
]
for avatar in AVATARS:
    open(f"content/avatars/{avatar['id']}.json", "w").write(json.dumps(avatar, indent=2) + "\n")
    print(avatar["id"], {k: (len(v["actions"]), sum(a["tier"] == "free" for a in v["actions"])) for k, v in avatar["variants"].items()}, "(actions, free)")

# Which older clip stands in for each zone until its real clip exists (read by scripts/placeholder-clips.mjs).
open("content/placeholder-clips.json", "w").write(json.dumps({clip(n, name): src for n, name, label, box, src, locked in ZONES}, indent=2) + "\n")
