#!/usr/bin/env python3
"""Touch zones that follow each avatar's own body proportions, computed by a script.

How it works
  1. A pose model (MediaPipe Pose Landmarker) finds body landmarks (eyes, mouth, shoulders,
     elbows, wrists, hips, knees, ankles ...) and a person mask (top of head, soles) in the idle
     frame of an outfit.
  2. Each zone is described relative to those landmarks, not to the picture: its top and bottom
     edge sit at a fixed fraction between two landmark levels (e.g. "a third of the way from
     the hip to the knee"), and its sides sit a fixed number of shoulder-widths (or head-widths
     for the face) from the body midline, the arm line or the leg line.
  3. Those rules (scripts/zone-rules.json) were fitted ONCE to the hand-drawn reference zones
     (scripts/reference-zones.json) on the reference picture. Every new body gets its zones by
     applying the same rules to its own landmarks, so a taller or broader character gets
     matching zones without anyone placing them by hand.

Usage (needs: pip install mediapipe pillow numpy; the model downloads on first use)
  python3 scripts/gen-zones.py calibrate <reference-frame.png>      -> scripts/zone-rules.json
  python3 scripts/gen-zones.py build <frames-dir>                   -> content/zones/<set>.json
      <frames-dir> holds one idle frame per outfit set, named <set>.png (node scripts/idle-frames.mjs makes them)
  python3 scripts/gen-zones.py check <frames-dir> <out-dir>         -> overlay pictures for a quick look
"""
import json, os, sys, urllib.request
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task"
MODEL = os.environ.get("POSE_MODEL") or os.path.expanduser("~/.cache/tickleme/pose_landmarker_heavy.task")
NAMES = "nose leye_in leye leye_out reye_in reye reye_out lear rear mouth_l mouth_r lsho rsho lelb relb lwri rwri lpin rpin lidx ridx lthu rthu lhip rhip lknee rknee lank rank lheel rheel lfoot rfoot".split()

_det = None
def detector():
    global _det
    if _det is None:
        from mediapipe.tasks import python as mpt
        from mediapipe.tasks.python import vision
        if not os.path.exists(MODEL):
            os.makedirs(os.path.dirname(MODEL), exist_ok=True)
            urllib.request.urlretrieve(MODEL_URL, MODEL)
        _det = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
            base_options=mpt.BaseOptions(model_asset_path=MODEL), output_segmentation_masks=True, num_poses=1))
    return _det

def analyze(path):
    """Landmarks and silhouette of one frame, as fractions of the picture."""
    import mediapipe as mp
    r = detector().detect(mp.Image.create_from_file(path))
    if not r.pose_landmarks:
        raise SystemExit(f"no person found in {path}")
    p = {n: np.array([q.x, q.y]) for n, q in zip(NAMES, r.pose_landmarks[0])}
    mask = np.squeeze(r.segmentation_masks[0].numpy_view()) > 0.5
    rows = np.where(mask.any(axis=1))[0]
    top, sole = rows.min() / mask.shape[0], (rows.max() + 1) / mask.shape[0]
    y = lambda *k: float(np.mean([p[a][1] for a in k]))
    # Vertical levels, top to bottom. "body" for head/torso/legs, "arm" for the arms.
    body = [top, y("leye", "reye"), y("mouth_l", "mouth_r"), y("lsho", "rsho"), y("lhip", "rhip"), y("lknee", "rknee"), y("lank", "rank"), sole]
    arm = {s: [p[s + "sho"][1], p[s + "elb"][1], p[s + "wri"][1], (p[s + "pin"][1] + p[s + "idx"][1]) / 2] for s in "lr"}
    for lv in [body, *arm.values()]:
        for i in range(1, len(lv)):
            lv[i] = max(lv[i], lv[i - 1] + 1e-3)  # keep strictly increasing
    mid = float(np.mean([p[a][0] for a in ("lsho", "rsho", "lhip", "rhip")]))
    # Both sides share one set of levels and mirrored x offsets, so the zones come out symmetric.
    def sym(l, r):
        l, r = np.array(l, float), np.array(r, float)
        off = ((l - mid) + (mid - r)) / 2
        return {"l": list(mid + off), "r": list(mid - off)}
    armx = sym([p["lsho"][0], p["lelb"][0], p["lwri"][0], (p["lpin"][0] + p["lidx"][0]) / 2], [p["rsho"][0], p["relb"][0], p["rwri"][0], (p["rpin"][0] + p["ridx"][0]) / 2])
    legx = sym([p["lhip"][0], p["lknee"][0], p["lank"][0], p["lank"][0]], [p["rhip"][0], p["rknee"][0], p["rank"][0], p["rank"][0]])
    armlv = [float(np.mean([arm["l"][i], arm["r"][i]])) for i in range(4)]
    leglv = [float(np.mean([p["lhip"][1], p["rhip"][1]])), float(np.mean([p["lknee"][1], p["rknee"][1]])), float(np.mean([p["lank"][1], p["rank"][1]])), sole]
    for lv in (armlv, leglv):
        for i in range(1, len(lv)):
            lv[i] = max(lv[i], lv[i - 1] + 1e-3)
    return {
        "mask": mask, "body": body, "arm": {"l": armlv, "r": armlv}, "mid": mid,
        "head": mid, "Sw": float(abs(p["lsho"][0] - p["rsho"][0])), "Hw": float(abs(p["lear"][0] - p["rear"][0])),
        "armx": armx, "legx": legx, "leglv": {"l": leglv, "r": leglv},
    }

def to_u(levels, y):
    """Position along a list of levels: 0 at the first, 1 at the second, ... (linear beyond the ends)."""
    k = int(np.clip(np.searchsorted(levels, y) - 1, 0, len(levels) - 2))
    return k + (y - levels[k]) / (levels[k + 1] - levels[k])

def from_u(levels, u):
    k = int(np.clip(np.floor(u), 0, len(levels) - 2))
    return levels[k] + (u - k) * (levels[k + 1] - levels[k])

def side_of(name):
    return "r" if name.startswith("right-") else "l" if name.startswith("left-") else None

# Which landmark system each zone follows.
def kind_of(name):
    if any(k in name for k in ("upper-arm", "elbow", "forearm", "hand", "underarm")): return "arm"
    if any(k in name for k in ("hip", "thigh", "knee", "shin", "foot")): return "leg"
    return "mid"

def scale_of(name):
    return "Hw" if name in ("forehead", "right-cheek", "left-cheek", "chin", "neck") else "Sw"

def frame(a, name, kind=None):
    """The levels and the horizontal centre line a zone is measured against."""
    kind, s = kind or kind_of(name), side_of(name)
    if kind == "arm":
        return a["arm"][s], (lambda y: float(np.interp(to_u(a["arm"][s], y), range(4), a["armx"][s])))
    if kind == "leg":
        lv = a["leglv"][s]
        return lv, (lambda y: float(np.interp(to_u(lv, y), range(4), a["legx"][s])))
    return a["body"], (lambda y: a["head" if kind == "head" else "mid"])

def layout(R):
    """The final zone set (scripts/zone-set.json) from the fitted reference rules.

    Merged zones take the union of their parts; a few are then reshaped on purpose, always in
    landmark units so they follow the body: arms run down to the wrist, hands and fingers are thin,
    the stomach sits between the ribs, the bikini bottom / groin is one small locked zone around the
    crotch (about 28% of the way from hip to knee), thighs run from hip to knee, breasts sit a bit higher."""
    def union(*names):
        rs = [R[n] for n in names]
        return {"kind": rs[0]["kind"], "scale": rs[0]["scale"], "u0": min(r["u0"] for r in rs), "u1": max(r["u1"] for r in rs),
                "x0": min(r["x0"] for r in rs), "x1": max(r["x1"] for r in rs)}
    def mirror(r): return {**r, "x0": -r["x1"], "x1": -r["x0"]}
    out = {}
    def pair(name, r):
        out["right-" + name], out["left-" + name] = r, mirror(r)
    def centred(name, r, half=None):
        half = half if half is not None else (r["x1"] - r["x0"]) / 2
        out[name] = {**r, "x0": -half, "x1": half}
    centred("forehead", R["forehead"])
    pair("cheek", R["right-cheek"])
    centred("neck", union("chin", "neck"))
    pair("shoulder", R["right-shoulder"])
    arm = union("right-upper-arm", "right-elbow", "right-forearm"); arm["u1"] = 2.0          # down to the wrist
    pair("arm", arm)
    # (pose models put the "pinky"/"index" landmarks at the knuckles, so hand = wrist..knuckles, fingers = beyond)
    c = (R["right-hand"]["x0"] + R["right-hand"]["x1"]) / 2                                   # thin: just the hand, then the fingers
    pair("hand", {**R["right-hand"], "u0": 2.0, "u1": 3.0, "x0": c - 0.15, "x1": c + 0.15})
    pair("fingers", {**R["right-hand"], "u0": 3.0, "u1": 3.9, "x0": c - 0.15, "x1": c + 0.15})
    pair("underarm", R["right-underarm"])
    centred("upper-chest", R["upper-chest"])
    crotch = 4.26
    groin_top = 3.92
    ribs = {**R["right-ribs"], "x1": -0.20, "u1": groin_top}                                # ribs leave room for the stomach
    pair("ribs", ribs)
    centred("stomach", {**R["belly"], "u0": R["right-ribs"]["u0"], "u1": groin_top}, half=0.20)
    pair("thigh", {"kind": "mid", "scale": "Sw", "u0": 3.95, "u1": 5.0, "x0": -0.62, "x1": 0.0})   # whole thigh, hip to knee
    ll = union("right-knee", "right-shin"); pair("lower-leg", {**ll, "u0": 1.0, "u1": 2.0})
    pair("foot", R["right-foot"])
    pair("breast", {**R["right-breast"], "u0": R["right-breast"]["u0"] - 0.09, "u1": R["right-breast"]["u1"] - 0.09})  # a little higher
    centred("bikini-bottom", {"kind": "mid", "scale": "Sw", "u0": groin_top, "u1": crotch}, half=0.38)
    return out

def calibrate(ref_png):
    a = analyze(ref_png)
    rules = {}
    for z in json.load(open(os.path.join(HERE, "reference-zones.json"))):
        x, y, w, h = z["box"]
        levels, line = frame(a, z["name"])
        ym = y + h / 2
        base, sc = line(ym), a[scale_of(z["name"])]
        rules[z["name"]] = {"kind": kind_of(z["name"]), "scale": scale_of(z["name"]), "u0": to_u(levels, y), "u1": to_u(levels, y + h), "x0": (x - base) / sc, "x1": (x + w - base) / sc}
    # Make the rules symmetric: a right zone and its left twin are mirror images, centre zones are centred.
    for n in list(rules):
        if n.startswith("right-"):
            r, l = rules[n], rules["left-" + n[6:]]
            u0, u1 = (r["u0"] + l["u0"]) / 2, (r["u1"] + l["u1"]) / 2
            x0, x1 = (r["x0"] - l["x1"]) / 2, (r["x1"] - l["x0"]) / 2
            rules[n] = {**r, "u0": u0, "u1": u1, "x0": x0, "x1": x1}
            rules["left-" + n[6:]] = {**l, "u0": u0, "u1": u1, "x0": -x1, "x1": -x0}
        elif not n.startswith("left-"):
            half = (rules[n]["x1"] - rules[n]["x0"]) / 2
            rules[n]["x0"], rules[n]["x1"] = -half, half
    rules = layout(rules)
    json.dump(rules, open(os.path.join(HERE, "zone-rules.json"), "w"), indent=1)
    print(f"fitted {len(rules)} zone rules to {ref_png}")

def zones_for(a, rules):
    out = {}
    for name, r in rules.items():
        levels, line = frame(a, name, r["kind"])
        y0, y1 = from_u(levels, r["u0"]), from_u(levels, r["u1"])
        base, sc = line((y0 + y1) / 2), a[r["scale"]]
        x0, x1 = base + r["x0"] * sc, base + r["x1"] * sc
        x0, x1, y0, y1 = max(0, x0), min(1, x1), max(0, y0), min(1, y1)
        out[name] = [round(x0, 4), round(y0, 4), round(x1 - x0, 4), round(y1 - y0, 4)]
    return out

def partition(boxes, locked, mask, margin=4, groups=None):
    """Label every pixel of the person (plus a small margin) with exactly one zone: no gaps, no overlaps.

    A pixel inside one or more zone boxes goes to the locked box if there is one, else to the box it is
    most central in. A pixel inside no box (a gap between boxes) goes to the nearest box. Returns an
    int array: 0 = background, 1..N = index into `names` (the order of `boxes`)."""
    import cv2
    H, W = mask.shape
    body = cv2.dilate(mask.astype(np.uint8), np.ones((2 * margin + 1, 2 * margin + 1), np.uint8)) > 0
    ys, xs = np.mgrid[0:H, 0:W]
    px, py = (xs + 0.5) / W, (ys + 0.5) / H
    names = list(boxes)
    cost = np.empty((len(names), H, W), np.float32)
    member = {n: n for n in names}
    for g, ms in (groups or {}).items():  # merged zones: a pixel belongs to the group of the box it fits best
        for m in ms: member[m] = g
    for i, n in enumerate(names):
        x, y, w, h = boxes[n]
        cn = np.maximum(np.abs(px - (x + w / 2)) / (w / 2), np.abs(py - (y + h / 2)) / (h / 2))  # <= 1 inside the box
        out = np.hypot(np.maximum(np.maximum(x - px, px - (x + w)), 0), np.maximum(np.maximum(y - py, py - (y + h)), 0))  # distance outside
        # inside: most central box wins, a locked box beats everything; outside any box: nearest box
        cost[i] = np.where(cn <= 1, cn - (10 if locked[n] else 0), 2 + out * 100)
    if groups:
        gnames = list(dict.fromkeys(member[n] for n in names))
        gcost = np.stack([np.min([cost[i] for i, n in enumerate(names) if member[n] == g], axis=0) for g in gnames])
        label = gcost.argmin(axis=0) + 1
        names = gnames
    else:
        label = cost.argmin(axis=0) + 1
    label[~body] = 0
    return label, names

def preview(frame_path, boxes, locked, mask, out_path, groups=None):
    label, names = partition(boxes, locked, mask, groups=groups)
    locked = {**locked, **{g: any(locked[m] for m in ms) for g, ms in (groups or {}).items()}}
    im = np.asarray(Image.open(frame_path).convert("RGB")).astype(float)
    pal = [(230, 25, 75), (60, 180, 75), (255, 225, 25), (0, 130, 200), (245, 130, 48), (145, 30, 180), (70, 240, 240), (240, 50, 230), (210, 245, 60), (250, 190, 190), (0, 128, 128), (170, 110, 40)]
    col = np.zeros_like(im)
    for i, n in enumerate(names):
        col[label == i + 1] = (0, 0, 0) if locked[n] and False else pal[i % len(pal)]
    over = np.where((label > 0)[..., None], 0.45 * col + 0.55 * im, im)
    # boundaries between different labels
    edge = np.zeros(label.shape, bool)
    edge[:, 1:] |= label[:, 1:] != label[:, :-1]
    edge[1:, :] |= label[1:, :] != label[:-1, :]
    over[edge] = (0, 0, 0)
    out = Image.fromarray(over.astype(np.uint8)); d = ImageDraw.Draw(out)
    for i, n in enumerate(names):
        yy, xx = np.where(label == i + 1)
        if len(xx): d.text((xx.mean() - 5, yy.mean() - 5), str(i + 1), fill=(255, 255, 255) if locked[n] else (0, 0, 0))
    out.save(out_path)
    return label, names

def build(frames_dir):
    rules = json.load(open(os.path.join(HERE, "zone-rules.json")))
    os.makedirs(os.path.join(ROOT, "content", "zones"), exist_ok=True)
    for f in sorted(os.listdir(frames_dir)):
        if not f.endswith(".png"): continue
        z = zones_for(analyze(os.path.join(frames_dir, f)), rules)
        bad = [n for n, (x, y, w, h) in z.items() if w < 0.02 or h < 0.012]
        if bad: raise SystemExit(f"{f}: degenerate zones {bad}")
        json.dump(z, open(os.path.join(ROOT, "content", "zones", f[:-4] + ".json"), "w"), indent=1)
        print("zones for", f[:-4])

def preview_cmd(frames_dir, set_name, out_png):
    zs = json.load(open(os.path.join(HERE, "zone-set.json")))
    rules = json.load(open(os.path.join(HERE, "zone-rules.json")))
    a = analyze(os.path.join(frames_dir, set_name + ".png"))
    z = zones_for(a, rules)
    boxes = {q["name"]: tuple(z[q["name"]]) for q in zs}
    label, names = preview(os.path.join(frames_dir, set_name + ".png"), boxes, {q["name"]: q["locked"] for q in zs}, a["mask"], out_png)
    # symmetry check: the mirrored label map must be the twin zone everywhere
    H, W = label.shape
    mx = np.clip(np.round(2 * a["mid"] * W - 1 - np.arange(W)).astype(int), 0, W - 1)
    twin = lambda n: n.replace("right-", "L#").replace("left-", "right-").replace("L#", "left-")
    ok = tot = 0
    for yy in range(0, H, 3):
        for xx in range(0, W, 3):
            if label[yy, xx] and label[yy, mx[xx]]:
                tot += 1; ok += names[label[yy, xx] - 1] == twin(names[label[yy, mx[xx]] - 1])
    print(f"{set_name}: {len(names)} zones, mirror agreement {100 * ok / tot:.1f}%, uncovered body pixels 0 by construction")

def check(frames_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    ref = {z["name"]: z for z in json.load(open(os.path.join(HERE, "zone-set.json")))}
    for f in sorted(os.listdir(frames_dir)):
        if not f.endswith(".png"): continue
        z = json.load(open(os.path.join(ROOT, "content", "zones", f[:-4] + ".json")))
        im = Image.open(os.path.join(frames_dir, f)).convert("RGB"); W, H = im.size; d = ImageDraw.Draw(im)
        for n, (x, y, w, h) in z.items():
            d.rectangle([x * W, y * H, (x + w) * W, (y + h) * H], outline=(220, 30, 30) if ref[n]["locked"] else (20, 140, 40), width=2)
        im.save(os.path.join(out_dir, f))

if __name__ == "__main__":
    cmd, *args = sys.argv[1:] or ["help"]
    {"calibrate": lambda: calibrate(*args), "build": lambda: build(*args), "check": lambda: check(*args), "preview": lambda: preview_cmd(*args)}.get(cmd, lambda: print(__doc__))()

