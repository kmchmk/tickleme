#!/usr/bin/env python3
"""Generate the placeholder demo-avatar clips with ffmpeg: python3 scripts/gen-demo-clips.py <out-dir>"""
import subprocess, sys, json
OUT = sys.argv[1]
W, H, FPS = 360, 640, 30
# name, color, w, h, x, y, group
EL = [
  ("legL", "0x3B5BA5", 40, 140, 125, 450, "legL"),
  ("legR", "0x3B5BA5", 40, 140, 195, 450, "legR"),
  ("armL", "0xE08A2E", 30, 120, 75, 280, "armL"),
  ("armR", "0xE08A2E", 30, 120, 255, 280, "armR"),
  ("body", "0xE08A2E", 140, 180, 110, 270, "body"),
  ("belly", "0xF5B66B", 70, 70, 145, 330, "body"),
  ("neck", "0xF2D2A9", 20, 24, 170, 250, "head"),
  ("earL", "0xF2D2A9", 14, 34, 116, 180, "ear"),
  ("earR", "0xF2D2A9", 14, 34, 230, 180, "ear"),
  ("head", "0xF2D2A9", 100, 100, 130, 150, "head"),
  ("hair", "0x6B3E1E", 100, 18, 130, 138, "head"),
  ("eyeL", "black", 14, 14, 152, 182, "head"),
  ("eyeR", "black", 14, 14, 194, 182, "head"),
  ("nose", "0xE87A90", 12, 10, 174, 203, "head"),
  ("mouth", "0x8B1A1A", 40, 6, 160, 226, "head"),
]
# Overlays that only appear during part of a clip (eyelids, open mouth).
EXTRA = {
  "lidL": ("0xF2D2A9", 14, 14, 152, 182, "head"),
  "lidR": ("0xF2D2A9", 14, 14, 194, 182, "head"),
  "mouthOpen": ("0x8B1A1A", 40, 22, 160, 222, "head"),
}
P = "PI"
# Each action: duration, per-group (dx, dy) expressions, extra overlays with enable windows.
ACTIONS = {
  "idle":   (2.0, {"all": ("0", "2*sin(PI*t)")}, {}),
  "nod":    (2.0, {"head": ("0", "25*sin(PI*t)"), "ear": ("0", "25*sin(PI*t)")}, {}),
  "wave":   (2.0, {"armR": ("0", "-110*sin(PI*t/2)")}, {}),
  "waveL":  (2.0, {"armL": ("0", "-110*sin(PI*t/2)")}, {}),
  "kickL":  (1.6, {"legL": ("-45*sin(PI*t/1.6)", "-20*sin(PI*t/1.6)")}, {}),
  "kickR":  (1.6, {"legR": ("45*sin(PI*t/1.6)", "-20*sin(PI*t/1.6)")}, {}),
  "giggle": (2.0, {"all": ("10*sin(6*PI*t)", "0")}, {}),
  "jump":   (1.5, {"all": ("0", "-90*sin(PI*t/1.5)")}, {}),
  "blink":  (1.2, {}, {"lidL": "between(t,0.2,0.4)+between(t,0.7,0.9)", "lidR": "between(t,0.2,0.4)+between(t,0.7,0.9)"}),
  "laugh":  (2.0, {"head": ("0", "6*sin(6*PI*t)"), "ear": ("0", "6*sin(6*PI*t)")}, {"mouthOpen": "between(t,0.15,1.85)"}),
  "sneeze": (1.2, {"head": ("12*sin(5*PI*t/1.2)*gt(t,0.4)", "0"), "ear": ("12*sin(5*PI*t/1.2)*gt(t,0.4)", "0")}, {"lidL": "between(t,0.3,0.6)", "lidR": "between(t,0.3,0.6)"}),
  "earWiggle": (1.0, {"ear": ("0", "-10*sin(4*PI*t)")}, {}),
  "shrug":  (1.6, {"armL": ("0", "-30*sin(PI*t/1.6)"), "armR": ("0", "-30*sin(PI*t/1.6)"), "head": ("0", "8*sin(PI*t/1.6)"), "ear": ("0", "8*sin(PI*t/1.6)")}, {}),
}
def off(moves, group, i):
    parts = [moves[g][i] for g in (group, "all") if g in moves]
    return f"round({'+'.join(f'({p})' for p in parts)})" if parts else "0"
for name, (d, moves, extra) in ACTIONS.items():
    # Action clips include a frame at t=d so they END exactly on the idle frame; idle loops so it stops one frame short.
    d = d if name == "idle" else round(d + 1 / FPS, 4)
    items = [(n, c, w, h, x, y, g, None) for n, c, w, h, x, y, g in EL]
    for n, en in extra.items():
        c, w, h, x, y, g = EXTRA[n]
        items.append((n, c, w, h, x, y, g, en))
    args = ["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", f"color=c=0x87CEEB:s={W}x{H}:r={FPS}:d={d}"]
    fc, prev = [], "0"
    for i, (n, c, w, h, x, y, g, en) in enumerate(items, 1):
        args += ["-f", "lavfi", "-i", f"color=c={c}:s={w}x{h}:r={FPS}:d={d}"]
        o = f"[{prev}][{i}]overlay=x='{x}+{off(moves,g,0)}':y='{y}+{off(moves,g,1)}':eval=frame"
        if en: o += f":enable='{en}'"
        prev = f"v{i}"
        fc.append(o + f"[{prev}]")
    args += ["-filter_complex", ";".join(fc), "-map", f"[{prev}]", "-c:v", "libx264", "-pix_fmt", "yuv420p",
             "-crf", "23", "-movflags", "+faststart", "-an", f"{OUT}/{name}.mp4"]
    subprocess.run(args, check=True)
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", f"{OUT}/idle.mp4", "-frames:v", "1", f"{OUT}/poster.jpg"], check=True)
