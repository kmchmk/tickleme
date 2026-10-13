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

def R(x, y, w, h): return {"shape": "rect", "x": round(x * 100, 2), "y": round(y * 100, 2), "w": round(w * 100, 2), "h": round(h * 100, 2)}

# (number, name, label, (x, y, w, h), placeholder source clip, locked)
ZONES = [
    (1, "forehead", "Forehead", (0.4297, 0.0456, 0.1416, 0.0521), "08-cheek", False),
    (2, "right-cheek", "Right cheek", (0.4297, 0.0977, 0.0703, 0.0521), "08-cheek", False),
    (3, "left-cheek", "Left cheek", (0.5000, 0.0977, 0.0713, 0.0521), "08-cheek", False),
    (4, "chin", "Chin", (0.4395, 0.1497, 0.1221, 0.0293), "07-neck", False),
    (5, "neck", "Neck", (0.4541, 0.1790, 0.0928, 0.0293), "07-neck", False),
    (6, "right-shoulder", "Right shoulder", (0.3369, 0.2051, 0.1172, 0.0553), "05-right-shoulder", False),
    (7, "left-shoulder", "Left shoulder", (0.5469, 0.2051, 0.1221, 0.0553), "06-left-shoulder", False),
    (8, "right-upper-arm", "Right upper arm", (0.3271, 0.3385, 0.0732, 0.0521), "03-right-forearm", False),
    (9, "left-upper-arm", "Left upper arm", (0.6006, 0.3385, 0.0732, 0.0521), "04-left-forearm", False),
    (10, "right-elbow", "Right elbow", (0.3271, 0.3906, 0.0732, 0.0586), "03-right-forearm", False),
    (11, "left-elbow", "Left elbow", (0.6006, 0.3906, 0.0732, 0.0586), "04-left-forearm", False),
    (12, "right-forearm", "Right forearm", (0.3223, 0.4492, 0.0781, 0.0846), "03-right-forearm", False),
    (13, "left-forearm", "Left forearm", (0.6006, 0.4492, 0.0781, 0.0846), "04-left-forearm", False),
    (14, "right-hand", "Right hand", (0.3223, 0.5339, 0.0879, 0.0716), "01-right-hand", False),
    (15, "left-hand", "Left hand", (0.5908, 0.5339, 0.0879, 0.0716), "02-left-hand", False),
    (16, "right-underarm", "Right underarm", (0.3271, 0.2604, 0.0537, 0.0781), "09-right-underarm", False),
    (17, "left-underarm", "Left underarm", (0.6201, 0.2604, 0.0537, 0.0781), "10-left-underarm", False),
    (18, "upper-chest", "Upper chest", (0.4443, 0.2051, 0.1123, 0.0456), "14-upper-chest", False),
    (19, "right-ribs", "Right ribs", (0.3906, 0.3451, 0.1074, 0.0716), "12-right-ribs", False),
    (20, "left-ribs", "Left ribs", (0.5029, 0.3451, 0.1074, 0.0716), "13-left-ribs", False),
    (21, "belly", "Belly", (0.4102, 0.4167, 0.1807, 0.0781), "11-belly", False),
    (22, "lower-belly", "Lower belly", (0.4248, 0.4948, 0.1514, 0.0651), "11-belly", False),
    (23, "right-hip", "Right hip", (0.3760, 0.5599, 0.0781, 0.0781), "15-right-hip", False),
    (24, "left-hip", "Left hip", (0.5469, 0.5599, 0.0781, 0.0781), "16-left-hip", False),
    (25, "right-thigh", "Right thigh", (0.3906, 0.6380, 0.1074, 0.1042), "17-right-thigh", False),
    (26, "left-thigh", "Left thigh", (0.5029, 0.6380, 0.1074, 0.1042), "18-left-thigh", False),
    (27, "right-knee", "Right knee", (0.4004, 0.7422, 0.0977, 0.0716), "17-right-thigh", False),
    (28, "left-knee", "Left knee", (0.5029, 0.7422, 0.0977, 0.0716), "18-left-thigh", False),
    (29, "right-shin", "Right shin", (0.4102, 0.8138, 0.0879, 0.0911), "19-right-foot", False),
    (30, "left-shin", "Left shin", (0.5029, 0.8138, 0.0879, 0.0911), "20-left-foot", False),
    (31, "right-foot", "Right foot", (0.4297, 0.9049, 0.0684, 0.0586), "19-right-foot", False),
    (32, "left-foot", "Left foot", (0.5029, 0.9049, 0.0684, 0.0586), "20-left-foot", False),
    (33, "right-breast", "Right breast", (0.3809, 0.2604, 0.1172, 0.0846), "05-right-shoulder", True),
    (34, "left-breast", "Left breast", (0.5029, 0.2604, 0.1172, 0.0846), "06-left-shoulder", True),
    (35, "groin", "Groin", (0.4541, 0.5599, 0.0928, 0.0716), "11-belly", True),
]
LOCKED = {n for n, *_, locked in ZONES if locked}

def clip(n, name): return f"{n:02d}-{name}"

def draw_order(z):
    # Locked zones on top; otherwise bigger zones first so small, precise ones stay tappable.
    n, name, label, (x, y, w, h), src, locked = z
    return (locked, -w * h)

def variant(set_, bucket, access, idle, poster, version, tier_of):
    acts = sorted(ZONES, key=draw_order)
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
    make("avatar-1", "Avatar 1", ("woman-in-jeans", 4), ("woman-in-bikini", 6), ("woman-in-nude", 2)),
    make("avatar-2", "Avatar 2", ("white-woman-in-jeans", 2), ("white-woman-in-bikini", 2), ("white-woman-in-nude", 2)),
    make("avatar-3", "Avatar 3", ("black-woman-in-jeans", 2), ("black-woman-in-bikini", 2), ("black-woman-in-nude", 2)),
]
for avatar in AVATARS:
    open(f"content/avatars/{avatar['id']}.json", "w").write(json.dumps(avatar, indent=2) + "\n")
    print(avatar["id"], {k: (len(v["actions"]), sum(a["tier"] == "free" for a in v["actions"])) for k, v in avatar["variants"].items()}, "(actions, free)")

# Which older clip stands in for each zone until its real clip exists (read by scripts/placeholder-clips.mjs).
open("content/placeholder-clips.json", "w").write(json.dumps({clip(n, name): src for n, name, label, box, src, locked in ZONES}, indent=2) + "\n")
