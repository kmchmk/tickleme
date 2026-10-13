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
    return {
        "mask": mask, "body": body, "arm": arm, "mid": mid,
        "Sw": float(abs(p["lsho"][0] - p["rsho"][0])), "Hw": float(abs(p["lear"][0] - p["rear"][0])),
        # x of the arm / leg centre lines at each of their levels
        "armx": {s: [p[s + "sho"][0], p[s + "elb"][0], p[s + "wri"][0], (p[s + "pin"][0] + p[s + "idx"][0]) / 2] for s in "lr"},
        "legx": {s: [p[s + "hip"][0], p[s + "knee"][0], p[s + "ank"][0], p[s + "ank"][0]] for s in "lr"},
        "leglv": {s: [p[s + "hip"][1], p[s + "knee"][1], p[s + "ank"][1], sole] for s in "lr"},
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

def frame(a, name):
    """The levels, the horizontal centre line and the scale a zone is measured against."""
    kind, s = kind_of(name), side_of(name)
    if kind == "arm":
        return a["arm"][s], (lambda y: float(np.interp(to_u(a["arm"][s], y), range(4), a["armx"][s])))
    if kind == "leg":
        lv = a["leglv"][s]
        return lv, (lambda y: float(np.interp(to_u(lv, y), range(4), a["legx"][s])))
    return a["body"], (lambda y: a["mid"])

def calibrate(ref_png):
    a = analyze(ref_png)
    rules = {}
    for z in json.load(open(os.path.join(HERE, "reference-zones.json"))):
        x, y, w, h = z["box"]
        levels, line = frame(a, z["name"])
        ym = y + h / 2
        base, sc = line(ym), a[scale_of(z["name"])]
        rules[z["name"]] = {"u0": to_u(levels, y), "u1": to_u(levels, y + h), "x0": (x - base) / sc, "x1": (x + w - base) / sc}
    # Belly, lower belly and groin are re-stacked between the bottom of the ribs and the crotch.
    # The hand-drawn reference put them too low for outfits whose crotch sits higher (bikini), and the
    # crotch is anatomy, not clothing: it is about 28% of the way from the hip to the knee.
    top, crotch = rules["belly"]["u0"], 4.28
    span = crotch - top
    rules["belly"]["u1"] = top + 0.40 * span
    rules["lower-belly"]["u0"], rules["lower-belly"]["u1"] = top + 0.40 * span, top + 0.70 * span
    rules["groin"]["u0"], rules["groin"]["u1"] = top + 0.55 * span, crotch + 0.03
    json.dump(rules, open(os.path.join(HERE, "zone-rules.json"), "w"), indent=1)
    print(f"fitted {len(rules)} zone rules to {ref_png}")

def zones_for(a, rules):
    out = {}
    for name, r in rules.items():
        levels, line = frame(a, name)
        y0, y1 = from_u(levels, r["u0"]), from_u(levels, r["u1"])
        base, sc = line((y0 + y1) / 2), a[scale_of(name)]
        x0, x1 = base + r["x0"] * sc, base + r["x1"] * sc
        x0, x1, y0, y1 = max(0, x0), min(1, x1), max(0, y0), min(1, y1)
        out[name] = [round(x0, 4), round(y0, 4), round(x1 - x0, 4), round(y1 - y0, 4)]
    return out

def partition(boxes, locked, mask, margin=4):
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
    for i, n in enumerate(names):
        x, y, w, h = boxes[n]
        cn = np.maximum(np.abs(px - (x + w / 2)) / (w / 2), np.abs(py - (y + h / 2)) / (h / 2))  # <= 1 inside the box
        out = np.hypot(np.maximum(np.maximum(x - px, px - (x + w)), 0), np.maximum(np.maximum(y - py, py - (y + h)), 0))  # distance outside
        # inside: most central box wins, a locked box beats everything; outside any box: nearest box
        cost[i] = np.where(cn <= 1, cn - (10 if locked[n] else 0), 2 + out * 100)
    label = cost.argmin(axis=0) + 1
    label[~body] = 0
    return label, names

def preview(frame_path, boxes, locked, mask, out_path):
    label, names = partition(boxes, locked, mask)
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
        bad = [n for n, (x, y, w, h) in z.items() if w < 0.02 or h < 0.015]
        if bad: raise SystemExit(f"{f}: degenerate zones {bad}")
        json.dump(z, open(os.path.join(ROOT, "content", "zones", f[:-4] + ".json"), "w"), indent=1)
        print("zones for", f[:-4])

def check(frames_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    ref = {z["name"]: z for z in json.load(open(os.path.join(HERE, "reference-zones.json")))}
    for f in sorted(os.listdir(frames_dir)):
        if not f.endswith(".png"): continue
        z = json.load(open(os.path.join(ROOT, "content", "zones", f[:-4] + ".json")))
        im = Image.open(os.path.join(frames_dir, f)).convert("RGB"); W, H = im.size; d = ImageDraw.Draw(im)
        for n, (x, y, w, h) in z.items():
            d.rectangle([x * W, y * H, (x + w) * W, (y + h) * H], outline=(220, 30, 30) if ref[n]["locked"] else (20, 140, 40), width=2)
        im.save(os.path.join(out_dir, f))

if __name__ == "__main__":
    cmd, *args = sys.argv[1:] or ["help"]
    {"calibrate": lambda: calibrate(*args), "build": lambda: build(*args), "check": lambda: check(*args)}.get(cmd, lambda: print(__doc__))()

