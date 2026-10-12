"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { assetUrl } from "@/lib/avatars";
import { getClip } from "@/lib/videoCache";
import type { AvatarAction, AvatarManifest, Region } from "@/lib/types";

type Ripple = { id: number; x: number; y: number; label?: string };

/**
 * Seamless switching between an idle loop and short action clips.
 *
 * Every clip has its own <video>, stacked in the same box. The idle loop sits on
 * top; action clips wait underneath, paused on their first frame. Every action
 * clip starts on the idle's first frame and ends on it again:
 *
 *   tap  -> clip.play(); once it is actually playing, fade it in over the still
 *           running idle (FADE_MS), so a tap while idle is mid-motion has no
 *           hard jump; then pause idle and pre-seek it to frame 0, unseen
 *   end  -> clip is frozen on its last frame (= idle frame 0); put idle on top
 *           again and resume it. Frames match, so this swap is invisible
 *
 * Elements are never display:none/visibility:hidden (the fading clip only has
 * its opacity animated while on top), so the browser keeps decoded frames ready.
 * Nothing depends on frame callbacks from a covered video, which browsers may
 * never fire.
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


/** Centre of a region in frame percent, used for hint dots. */
const regionCenter = (region: Region | Region[]): [number, number] => {
  const r = [region].flat()[0];
  if (r.shape === "rect") return [r.x + r.w / 2, r.y + r.h / 2];
  const n = r.points.length;
  return [r.points.reduce((a, p) => a + p[0], 0) / n, r.points.reduce((a, p) => a + p[1], 0) / n];
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
  avatar,
  showHints = false,
  debug = false,
  onReady,
}: {
  avatar: AvatarManifest;
  showHints?: boolean;
  debug?: boolean;
  onReady?: () => void;
}) {
  const [urls, setUrls] = useState<Record<string, string> | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const idleRef = useRef<HTMLVideoElement>(null);
  const clipRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const busy = useRef(false);
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
    const files = [avatar.idle, ...avatar.actions.map((a) => a.video)];
    let done = 0;
    setProgress(0);
    Promise.all(
      files.map(async (f) => {
        const u = URL.createObjectURL(await getClip(assetUrl(avatar, f), avatar.version ?? 1));
        created.push(u);
        if (!cancelled) setProgress(++done / files.length);
        return [f, u] as const;
      }),
    )
      .then((entries) => !cancelled && setUrls(Object.fromEntries(entries)))
      .catch((e) => !cancelled && setError(String(e.message ?? e)));
    return () => {
      cancelled = true;
      created.forEach(URL.revokeObjectURL);
    };
  }, [avatar]);

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
          v.pause();
          v.currentTime = 0;
        })
        .catch(() => {});
    }
  };

  const play = useCallback(
    async (action: AvatarAction) => {
      const idle = idleRef.current;
      const clip = clipRefs.current[action.id];
      if (!idle || !clip || busy.current) return;
      busy.current = true;
      prime(clip);
      note(`tap ${action.id} (readyState ${clip.readyState})`);

      try {
        if (clip.currentTime !== 0) clip.currentTime = 0;
        const playing = clip.readyState >= 3 ? Promise.resolve() : once(clip, "playing");
        await clip.play();
        await playing;
      } catch (e) {
        note(`play failed: ${(e as Error).message}`);
        busy.current = false;
        return;
      }
      // Fade the clip in above the still-running idle.
      clip.style.transition = "none";
      clip.style.opacity = "0";
      clip.style.zIndex = "3";
      void clip.offsetWidth; // commit opacity 0 before animating
      clip.style.transition = `opacity ${FADE_MS}ms linear`;
      clip.style.opacity = "1";
      note(`playing ${action.id}`);
      await new Promise((r) => setTimeout(r, FADE_MS + 30));
      idle.pause();
      idle.currentTime = 0; // pre-seek while fully covered

      await once(clip, "ended");
      // clip now shows its last frame == idle frame 0
      if (idle.seeking) await once(idle, "seeked");
      clip.style.zIndex = "1"; // idle (z-index 2) is on top again
      clip.style.transition = "none";
      clip.style.opacity = "1";
      await idle.play().catch(() => {});
      clip.currentTime = 0; // rewind underneath, ready for next tap
      busy.current = false;
      note(`back to idle`);
    },
    [note],
  );

  const onTap = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 100;
    const y = ((e.clientY - box.top) / box.height) * 100;
    const id = (e.target as Element).closest("[data-action]")?.getAttribute("data-action");
    const action = avatar.actions.find((a) => a.id === id);
    const ripple = { id: ++rippleId.current, x, y, label: action && !busy.current ? shortLabel(action.label) : undefined };
    setRipples((r) => [...r, ripple]);
    setTimeout(() => setRipples((r) => r.filter((p) => p.id !== ripple.id)), 900);
    if (action) void play(action);
  };

  return (
    <div className="player">
      {urls &&
        avatar.actions.map((a) => (
          <video
            key={a.id}
            ref={(el) => {
              clipRefs.current[a.id] = el;
              prepVideo(el);
            }}
            src={urls[a.video]}
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
          src={urls[avatar.idle]}
          muted
          loop
          autoPlay
          playsInline
          preload="auto"
          className="player-video"
          style={{ zIndex: 2 }}
        />
      )}

      {!urls && (
        <div className="player-loading" role="status" aria-live="polite">
          {error ? (
            <p>Couldn&apos;t load {avatar.name}. Check your connection and try again.</p>
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
              <span>Waking up {avatar.name}… {Math.round(progress * 100)}%</span>
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
          aria-label={`Touch ${avatar.name}`}
        >
          {avatar.actions.map((a) => (
            <path
              key={a.id}
              data-action={a.id}
              d={regionPath(a.region)}
              className={`hit ${showHints || debug ? "hit--shown" : ""}`}
              vectorEffect="non-scaling-stroke"
            >
              <title>{a.label}</title>
            </path>
          ))}
        </svg>
      )}

      {urls && showHints && (
        <div className="hint-dots" aria-hidden>
          {avatar.actions.map((a) => {
            const [x, y] = regionCenter(a.region);
            return <span key={a.id} className="hint-dot" style={{ left: `${x}%`, top: `${y}%` }} />;
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
