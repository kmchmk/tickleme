"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { assetUrl } from "@/lib/avatars";
import type { AvatarAction, AvatarManifest, Region } from "@/lib/types";

/**
 * Seamless switching between an idle loop and short action clips.
 *
 * Every clip has its own <video>, stacked in the same box. Exactly one of them
 * is "on top" (z-index); the others sit underneath, paused on their first
 * frame. Because every action clip starts and ends on the idle frame, swapping
 * which element is on top at the right moment is invisible:
 *
 *   tap  -> clip.play(); once it is actually playing, raise it and pause idle
 *   end  -> clip is frozen on its last frame (= idle frame 0); seek idle to 0,
 *           and once the seek is done raise idle and resume it
 *
 * The elements are never hidden (display/visibility/opacity), so the browser
 * keeps their current frame decoded and ready to paint. Nothing depends on
 * frame callbacks from a covered video, which browsers may never fire.
 *
 * Every clip is downloaded fully into a blob URL before the avatar is shown, so
 * playback never stalls on the network.
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

async function toBlobUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

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
  debug = false,
}: {
  avatar: AvatarManifest;
  debug?: boolean;
}) {
  const [urls, setUrls] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const idleRef = useRef<HTMLVideoElement>(null);
  const clipRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const busy = useRef(false);
  const primed = useRef(false);

  const note = useCallback(
    (msg: string) => debug && setLog((l) => [...l.slice(-5), msg]),
    [debug],
  );

  // Download all clips up front.
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    const files = [avatar.idle, ...avatar.actions.map((a) => a.video)];
    Promise.all(
      files.map(async (f) => {
        const u = await toBlobUrl(assetUrl(avatar, f));
        created.push(u);
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

  const raise = (top: HTMLVideoElement) => {
    for (const v of [idleRef.current, ...Object.values(clipRefs.current)]) {
      if (v) v.style.zIndex = v === top ? "2" : "1";
    }
  };

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
      raise(clip);
      idle.pause();
      note(`playing ${action.id}`);

      await once(clip, "ended");
      // clip now shows its last frame == idle frame 0
      idle.currentTime = 0;
      if (idle.seeking) await once(idle, "seeked");
      raise(idle);
      await idle.play().catch(() => {});
      clip.currentTime = 0; // rewind underneath, ready for next tap
      busy.current = false;
      note(`back to idle`);
    },
    [note],
  );

  if (error) return <p>Failed to load clips: {error}</p>;

  return (
    <>
      <div
        style={{
          position: "relative",
          width: "min(100%, 480px)",
          aspectRatio: String(avatar.aspectRatio),
          background: avatar.poster
            ? `#000 url(${assetUrl(avatar, avatar.poster)}) center / 100% 100%`
            : "#000",
          touchAction: "manipulation",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
        }}
      >
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
              style={{ ...videoStyle, zIndex: 1 }}
            />
          ))}
        {urls ? (
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
            style={{ ...videoStyle, zIndex: 2 }}
          />
        ) : (
          <p style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
            Loading…
          </p>
        )}
        {urls && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 3 }}
          >
            {avatar.actions.map((a) => (
              <path
                key={a.id}
                d={regionPath(a.region)}
                onClick={() => play(a)}
                fill={debug ? "rgba(255,0,100,0.25)" : "rgba(0,0,0,0)"}
                stroke={debug ? "#f06" : "none"}
                strokeWidth={0.4}
                style={{ cursor: "pointer" }}
              >
                <title>{a.label}</title>
              </path>
            ))}
          </svg>
        )}
      </div>
      {debug && (
        <pre style={{ fontSize: 12, width: "min(100%, 480px)", whiteSpace: "pre-wrap" }}>
          {log.join("\n") || "tap a region…"}
        </pre>
      )}
    </>
  );
}

const videoStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "fill",
};
