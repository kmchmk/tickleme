"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getClip } from "@/lib/videoCache";
import type { PlayerAction, PlayerManifest, Region } from "@/lib/types";

type Ripple = { id: number; x: number; y: number; label?: string };

/**
 * Seamless, instantly responsive switching between an idle loop and short
 * action clips.
 *
 * Every clip has its own <video>, stacked in one box: the idle loop and the
 * action clips (paused on their first frame). Whatever is showing, a tap works
 * immediately, even while another clip is mid-play:
 *
 *   tap -> freeze the visible frame on a <canvas> above everything, start the
 *          tapped clip from frame 0 underneath it, then fade the canvas out
 *          (FADE_MS). The old clip is paused and rewound, unseen.
 *   end -> the clip is on its last frame (= idle frame 0): put idle on top
 *          again and resume it. Frames match, so this swap is invisible.
 *
 * A newer tap cancels the run of the previous one (run counter), so rapid
 * tapping, or tapping the same spot again, just restarts smoothly.
 * Videos are never display:none/visibility:hidden, so the browser keeps decoded
 * frames ready, and nothing waits on frame callbacks from a covered video.
 *
 * Every clip is loaded fully (from the IndexedDB cache, else the network) into
 * a blob URL before the avatar is shown, so playback never stalls.
 */

const regionPath = (region: Region | Region[]) =>
  [region]
    .flat()
    .map((r) =>
      r.shape === "rect"
        ? `M${r.x},${r.y}h${r.w}v${r.h}h${-r.w}z`
        : `M${r.points.map((p) => p.join(",")).join("L")}z`,
    )
    .join("");


/** Centre of a zone in frame percent (area-weighted over its rectangles). */
const regionCenter = (region: Region | Region[]): [number, number] => {
  let sx = 0, sy = 0, sa = 0;
  for (const r of [region].flat()) {
    if (r.shape !== "rect") continue;
    sx += (r.x + r.w / 2) * r.w * r.h;
    sy += (r.y + r.h / 2) * r.w * r.h;
    sa += r.w * r.h;
  }
  return [sx / sa, sy / sa];
};

/** "Kick (left leg)" -> "Kick" */
const shortLabel = (label: string) => label.replace(/\s*\(.*\)\s*$/, "");

/** Cross-fade length when an action clip takes over from the idle loop. */
const FADE_MS = 200;

const once = (el: HTMLVideoElement, event: string) =>
  new Promise<void>((resolve) => el.addEventListener(event, () => resolve(), { once: true }));

/** iOS only honours muted autoplay/inline play when the attributes are present. */
const prepVideo = (el: HTMLVideoElement | null) => {
  if (!el) return;
  el.muted = true;
  el.defaultMuted = true;
  el.setAttribute("muted", "");
  el.setAttribute("playsinline", "");
  el.setAttribute("webkit-playsinline", "");
};

export default function AvatarPlayer({
  manifest,
  showHints = false,
  debug = false,
  onReady,
  onLockedTap,
}: {
  manifest: PlayerManifest;
  showHints?: boolean;
  debug?: boolean;
  onReady?: () => void;
  /** Called when a locked tap location is tapped (no clip exists for it). */
  onLockedTap?: (action: PlayerAction) => void;
}) {
  // Only unlocked actions have a clip; locked ones are just a lock on the picture.
  const playable = manifest.actions.filter((a) => a.url);
  const [urls, setUrls] = useState<Record<string, string> | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const idleRef = useRef<HTMLVideoElement>(null);
  const clipRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const snapRef = useRef<HTMLCanvasElement>(null);
  const runId = useRef(0); // bumped on every tap; stale runs stop touching state
  const stopWait = useRef<(() => void) | null>(null);
  const active = useRef<HTMLVideoElement | null>(null); // element currently showing
  const primed = useRef(false);
  const rippleId = useRef(0);

  const note = useCallback(
    (msg: string) => debug && setLog((l) => [...l.slice(-5), msg]),
    [debug],
  );

  // Load all clips up front (IndexedDB cache first, then network).
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    const files = [{ key: manifest.idle.key, url: manifest.idle.url }, ...playable.map((a) => ({ key: a.key, url: a.url! }))];
    let done = 0;
    setProgress(0);
    Promise.all(
      files.map(async (f) => {
        const u = URL.createObjectURL(await getClip(f.key, f.url, manifest.version));
        created.push(u);
        if (!cancelled) setProgress(++done / files.length);
        return [f.key, u] as const;
      }),
    )
      .then((entries) => !cancelled && setUrls(Object.fromEntries(entries)))
      .catch((e) => !cancelled && setError(String(e.message ?? e)));
    return () => {
      cancelled = true;
      created.forEach(URL.revokeObjectURL);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest]);

  useEffect(() => {
    if (urls) onReady?.();
  }, [urls, onReady]);

  // Mobile browsers ignore preload; on the first tap, decode every clip's first
  // frame (play+pause inside the user gesture) so later swaps are instant.
  const prime = (except: HTMLVideoElement) => {
    if (primed.current) return;
    primed.current = true;
    for (const v of Object.values(clipRefs.current)) {
      if (!v || v === except) continue;
      v.play()
        .then(() => {
          if (active.current === v) return; // a quick second tap already took it
          v.pause();
          v.currentTime = 0;
        })
        .catch(() => {});
    }
  };

  const play = useCallback(
    async (action: PlayerAction) => {
      const idle = idleRef.current;
      const next = clipRefs.current[action.id];
      const snap = snapRef.current;
      if (!idle || !next) return;
      const run = ++runId.current;
      stopWait.current?.(); // release an earlier run that is waiting for its clip to end
      const cur = active.current ?? idle;
      active.current = next;
      prime(next);
      note(`tap ${action.id}`);

      // 1. Freeze whatever is showing on the canvas, above everything.
      if (snap) {
        if (snap.width !== (cur.videoWidth || 1)) {
          snap.width = cur.videoWidth || 1;
          snap.height = cur.videoHeight || 1;
        }
        snap.getContext("2d")?.drawImage(cur, 0, 0, snap.width, snap.height);
        snap.style.transition = "none";
        snap.style.opacity = "1";
      }

      // 2. Start the tapped clip from frame 0, on top of the other videos.
      for (const v of Object.values(clipRefs.current)) if (v) v.style.zIndex = v === next ? "4" : "1";
      if (cur !== idle && cur !== next) {
        cur.pause();
        cur.currentTime = 0;
      }
      try {
        next.currentTime = 0;
        await next.play();
        if (next.seeking) await once(next, "seeked");
      } catch (e) {
        note(`play failed: ${(e as Error).message}`);
        if (run === runId.current) {
          active.current = idle;
          if (snap) snap.style.opacity = "0";
        }
        return;
      }
      if (run !== runId.current) return; // a newer tap took over
      note(`playing ${action.id}`);

      // 3. Fade the frozen frame away to reveal the clip.
      if (snap) {
        void snap.offsetWidth;
        snap.style.transition = `opacity ${FADE_MS}ms linear`;
        snap.style.opacity = "0";
      }
      await new Promise((r) => setTimeout(r, FADE_MS + 30));
      if (run !== runId.current) return;
      idle.pause();
      idle.currentTime = 0; // pre-seek while fully covered

      // 4. Wait for the clip to finish, then hand back to idle.
      await new Promise<void>((resolve) => {
        next.addEventListener("ended", () => resolve(), { once: true });
        stopWait.current = resolve;
      });
      if (run !== runId.current) return;
      if (idle.seeking) await once(idle, "seeked");
      if (run !== runId.current) return;
      next.style.zIndex = "1"; // idle (z-index 2) is on top again
      await idle.play().catch(() => {});
      next.currentTime = 0; // rewind underneath, ready for next tap
      active.current = idle;
      note(`back to idle`);
    },
    [note],
  );

  const onTap = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 100;
    const y = ((e.clientY - box.top) / box.height) * 100;
    const id = (e.target as Element).closest("[data-action]")?.getAttribute("data-action");
    const action = manifest.actions.find((a) => a.id === id);
    const ripple = { id: ++rippleId.current, x, y, label: action && !action.locked ? shortLabel(action.label) : undefined };
    setRipples((r) => [...r, ripple]);
    setTimeout(() => setRipples((r) => r.filter((p) => p.id !== ripple.id)), 900);
    if (!action) return;
    if (action.locked) onLockedTap?.(action);
    else void play(action);
  };

  return (
    <div className="player">
      {urls &&
        playable.map((a) => (
          <video
            key={a.id}
            ref={(el) => {
              clipRefs.current[a.id] = el;
              prepVideo(el);
            }}
            src={urls[a.key]}
            muted
            playsInline
            preload="auto"
            className="player-video"
            style={{ zIndex: 1 }}
          />
        ))}
      {urls && (
        <video
          ref={(el) => {
            idleRef.current = el;
            prepVideo(el);
          }}
          src={urls[manifest.idle.key]}
          muted
          loop
          autoPlay
          playsInline
          preload="auto"
          className="player-video"
          style={{ zIndex: 2 }}
        />
      )}

      {urls && <canvas ref={snapRef} className="player-snap" aria-hidden />}

      {!urls && (
        <div className="player-loading" role="status" aria-live="polite">
          {error ? (
            <p>Couldn&apos;t load {manifest.name}. Check your connection and try again.</p>
          ) : (
            <>
              <svg viewBox="0 0 36 36" className="progress-ring" aria-hidden>
                <circle cx="18" cy="18" r="15.5" className="progress-track" />
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  className="progress-value"
                  strokeDasharray={`${progress * 97.4} 97.4`}
                />
              </svg>
              <span>Waking up {manifest.name}… {Math.round(progress * 100)}%</span>
            </>
          )}
        </div>
      )}

      {urls && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="player-hits"
          onClick={onTap}
          role="group"
          aria-label={`Touch ${manifest.name}`}
        >
          {manifest.actions.map((a) => (
            <path key={a.id} data-action={a.id} d={regionPath(a.region)} className="hit" shapeRendering="crispEdges">
              <title>{a.label}</title>
            </path>
          ))}
          {(showHints || debug) &&
            manifest.actions.map((a) => (
              <path key={`o-${a.id}`} d={a.outline} className={`hit-outline ${a.locked ? "hit-outline--locked" : ""}`} vectorEffect="non-scaling-stroke" />
            ))}
        </svg>
      )}

      {/* Padlocks only show while "Show touch spots" is on; before that a locked spot looks like any other. */}
      {urls && showHints && (
        <div className="hint-dots" aria-hidden>
          {manifest.actions
            .filter((a) => a.locked)
            .map((a) => {
              const [x, y] = regionCenter(a.region);
              return (
                <span key={a.id} className="lock-dot" style={{ left: `${x}%`, top: `${y}%` }}>
                  <svg viewBox="0 0 24 24">
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                </span>
              );
            })}
        </div>
      )}

      <div className="ripples" aria-hidden>
        {ripples.map((r) => (
          <span key={r.id} className="ripple" style={{ left: `${r.x}%`, top: `${r.y}%` }}>
            {r.label && <span className="ripple-label">{r.label}!</span>}
          </span>
        ))}
      </div>

      {debug && <pre className="player-debug">{log.join("\n") || "tap a region…"}</pre>}
    </div>
  );
}
