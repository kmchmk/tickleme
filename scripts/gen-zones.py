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
    # (thin; the pose model's pinky/index landmarks are the knuckles, so wrist..u=3.9 is the hand with its fingers)
    c = (R["right-hand"]["x0"] + R["right-hand"]["x1"]) / 2                                   # thin: just the hand, then the fingers
    pair("hand", {**R["right-hand"], "u0": 2.0, "u1": 3.9, "x0": c - 0.15, "x1": c + 0.15})
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

CELL_X, CELL_Y = 1 / 96, 1 / 144   # the touch map is a grid of ~5px cells (of a 480x720 frame)

def zone_set():
    return json.load(open(os.path.join(HERE, "zone-set.json")))

def twin(n):
    return n.replace("right-", "L#").replace("left-", "right-").replace("L#", "left-")

def grid_zones(a, boxes, locked):
    """Cut the person into touch zones: every body cell belongs to exactly one zone (no gaps, no overlaps).

    The grid is anchored on the body's midline, and the screen-right half is the exact mirror of the
    screen-left half, so the result is symmetric. A cell inside one or more zone boxes goes to the locked
    box if there is one, else to the box it is most central in; a cell inside no box goes to the nearest
    box. Cells further than a small margin from the person's silhouette are background (no zone).

    Returns (names, xs, ys, grid): xs/ys are the cell edges (fractions of the picture), grid[j][i] is
    the 1-based zone index of the cell in row j, column i (0 = background)."""
    import cv2
    mask = a["mask"]; H, W = mask.shape
    body = cv2.dilate(mask.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    cx = a["mid"]
    n = int(np.ceil(max(cx, 1 - cx) / CELL_X))
    edges = cx + CELL_X * np.arange(-n, n + 1)                 # column edges; the midline is an edge
    ys = np.arange(0, int(np.ceil(1 / CELL_Y)) + 1) * CELL_Y
    ycen = np.minimum((ys[:-1] + ys[1:]) / 2, 0.9999)
    names = [z["name"] for z in zone_set()]
    idx = {nm: i for i, nm in enumerate(names)}
    def on_body(x, y):                                          # symmetric silhouette: either side counts
        xs = np.clip(((np.array([x, 2 * cx - x])) * W).astype(int), 0, W - 1)
        return any(body[min(int(y * H), H - 1), xi] for xi in xs)
    # screen-left half (columns left of the midline): decide, then mirror
    grid = np.zeros((len(ycen), 2 * n), int)
    for i in range(n):                                          # i = distance from the midline, in cells
        x = cx - (i + 0.5) * CELL_X
        for j, y in enumerate(ycen):
            if x < 0 or not on_body(x, y):
                continue
            best, bi = 1e9, 0
            for nm, (bx, by, bw, bh) in boxes.items():
                cn = max(abs(x - (bx + bw / 2)) / (bw / 2), abs(y - (by + bh / 2)) / (bh / 2))
                if cn <= 1:
                    c = cn - (10 if locked[nm] else 0)
                else:
                    c = 2 + 100 * np.hypot(max(bx - x, x - (bx + bw), 0), max(by - y, y - (by + bh), 0))
                if c < best: best, bi = c, idx[nm] + 1
            grid[j, n - 1 - i] = bi
            grid[j, n + i] = idx[twin(names[bi - 1])] + 1
    return names, edges, ys, grid

def rects_of(grid, edges, ys, k):
    """Exact tiling of zone k's cells by rectangles (row runs, merged downwards when identical)."""
    open_runs, out = {}, []
    def flush(keep):
        for key in [q for q in open_runs if q not in keep]:
            (i0, i1), j0 = key, open_runs.pop(key)
            out.append((edges[i0], ys[j0], edges[i1] - edges[i0], ys[flush.j] - ys[j0]))
    for j in range(len(grid) + 1):
        runs = set()
        if j < len(grid):
            row = grid[j] == k; i = 0
            while i < len(row):
                if row[i]:
                    i0 = i
                    while i < len(row) and row[i]: i += 1
                    runs.add((i0, i))
                else: i += 1
        flush.j = j
        flush(runs)
        for r in runs: open_runs.setdefault(r, j)
    return out

def outline_of(grid, edges, ys, k):
    """The zone's border (edges against other zones or background) as merged line segments."""
    segs = {"h": {}, "v": {}}
    Hn, Wn = grid.shape
    cell = lambda j, i: grid[j, i] if 0 <= j < Hn and 0 <= i < Wn else 0
    for j in range(Hn):
        for i in range(Wn):
            if grid[j, i] != k: continue
            if cell(j - 1, i) != k: segs["h"].setdefault(j, []).append(i)
            if cell(j + 1, i) != k: segs["h"].setdefault(j + 1, []).append(i)
            if cell(j, i - 1) != k: segs["v"].setdefault(i, []).append(j)
            if cell(j, i + 1) != k: segs["v"].setdefault(i + 1, []).append(j)
    d = []
    for j, cs in segs["h"].items():
        cs.sort(); s0 = prev = cs[0]
        for c in cs[1:] + [None]:
            if c is None or c != prev + 1:
                d.append(f"M{edges[s0] * 100:.2f},{ys[j] * 100:.2f}H{edges[prev + 1] * 100:.2f}")
                if c is not None: s0 = c
            prev = c if c is not None else prev
    for i, rs in segs["v"].items():
        rs.sort(); s0 = prev = rs[0]
        for c in rs[1:] + [None]:
            if c is None or c != prev + 1:
                d.append(f"M{edges[i] * 100:.2f},{ys[s0] * 100:.2f}V{ys[prev + 1] * 100:.2f}")
                if c is not None: s0 = c
            prev = c if c is not None else prev
    return "".join(d)

def verify(names, edges, ys, grid):
    """Rasterise the rectangles back: each body cell must be covered exactly once, background never."""
    cover = np.zeros(grid.shape, int)
    for k in range(1, len(names) + 1):
        for (x, y, w, h) in rects_of(grid, edges, ys, k):
            i0, i1 = np.searchsorted(edges, [x - 1e-9, x + w - 1e-9]); j0, j1 = np.searchsorted(ys, [y - 1e-9, y + h - 1e-9])
            cover[j0:j1, i0:i1] += 1
            assert (grid[j0:j1, i0:i1] == k).all(), f"rect of {names[k - 1]} covers another zone"
    assert ((cover == 1) == (grid > 0)).all() and cover.max() <= 1, "gaps or overlaps"
    assert all((grid == k).any() for k in range(1, len(names) + 1)), "a zone vanished"
    mirror = grid[:, ::-1]
    assert all(g == 0 and m == 0 or names[g - 1] == twin(names[m - 1]) for g, m in zip(grid.ravel(), mirror.ravel())), "not symmetric"

def compute(frame_path, rules):
    a = analyze(frame_path)
    z = zones_for(a, rules)
    zs = zone_set()
    boxes = {q["name"]: tuple(z[q["name"]]) for q in zs}
    names, edges, ys, grid = grid_zones(a, boxes, {q["name"]: q["locked"] for q in zs})
    verify(names, edges, ys, grid)
    return names, edges, ys, grid

def build(frames_dir):
    rules = json.load(open(os.path.join(HERE, "zone-rules.json")))
    os.makedirs(os.path.join(ROOT, "content", "zones"), exist_ok=True)
    for f in sorted(os.listdir(frames_dir)):
        if not f.endswith(".png"): continue
        names, edges, ys, grid = compute(os.path.join(frames_dir, f), rules)
        out = {}
        for k, nm in enumerate(names, 1):
            rs = rects_of(grid, edges, ys, k)
            out[nm] = {"rects": [[round(x * 100, 3), round(y * 100, 3), round(w * 100, 3), round(h * 100, 3)] for x, y, w, h in rs], "outline": outline_of(grid, edges, ys, k)}
        json.dump(out, open(os.path.join(ROOT, "content", "zones", f[:-4] + ".json"), "w"), separators=(",", ":"))
        print(f"zones for {f[:-4]}: {len(names)} zones, {sum(len(v['rects']) for v in out.values())} rects, verified (no gaps, no overlaps, symmetric)")

def preview_cmd(frames_dir, set_name, out_png):
    names, edges, ys, grid = compute(os.path.join(frames_dir, set_name + ".png"), json.load(open(os.path.join(HERE, "zone-rules.json"))))
    locked = {q["name"]: q["locked"] for q in zone_set()}
    im = Image.open(os.path.join(frames_dir, set_name + ".png")).convert("RGB"); W, H = im.size
    pal = [(230, 25, 75), (60, 180, 75), (255, 225, 25), (0, 130, 200), (245, 130, 48), (145, 30, 180), (70, 240, 240), (240, 50, 230), (210, 245, 60), (250, 190, 190), (0, 128, 128), (170, 110, 40)]
    ov = Image.new("RGBA", im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    for j in range(grid.shape[0]):
        for i in range(grid.shape[1]):
            if grid[j, i]:
                d.rectangle([edges[i] * W, ys[j] * H, edges[i + 1] * W - 1, ys[j + 1] * H - 1], fill=pal[(grid[j, i] - 1) % len(pal)] + (115,))
    im = Image.alpha_composite(im.convert("RGBA"), ov); d = ImageDraw.Draw(im)
    for k, nm in enumerate(names, 1):
        for seg in outline_of(grid, edges, ys, k).split("M")[1:]:
            a_, b_ = (seg.split("H") if "H" in seg else seg.split("V"))
            x0, y0 = [float(t) / 100 for t in a_.split(",")]
            x1, y1 = (float(b_) / 100, y0) if "H" in seg else (x0, float(b_) / 100)
            d.line([x0 * W, y0 * H, x1 * W, y1 * H], fill=(0, 0, 0, 255), width=1)
        yy, xx = np.where(grid == k)
        cxp = float(np.mean((edges[xx] + edges[xx + 1]) / 2)) * W; cyp = float(np.mean((ys[yy] + ys[yy + 1]) / 2)) * H
        d.text((cxp - 5, cyp - 5), str(k), fill=(255, 255, 255, 255) if locked[nm] else (0, 0, 0, 255))
    im.convert("RGB").save(out_png)
    print(f"{set_name}: {len(names)} zones, verified (no gaps, no overlaps, symmetric)")

def check(frames_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    for f in sorted(os.listdir(frames_dir)):
        if f.endswith(".png"): preview_cmd(frames_dir, f[:-4], os.path.join(out_dir, f))

if __name__ == "__main__":
    cmd, *args = sys.argv[1:] or ["help"]
    {"calibrate": lambda: calibrate(*args), "build": lambda: build(*args), "check": lambda: check(*args), "preview": lambda: preview_cmd(*args)}.get(cmd, lambda: print(__doc__))()
