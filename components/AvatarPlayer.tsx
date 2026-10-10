"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { assetUrl } from "@/lib/avatars";
import type { AvatarAction, AvatarManifest, Region } from "@/lib/types";

/**
 * Layers (bottom -> top): one <video> per action, then the idle <video>, then a
 * transparent SVG hit-layer. Idle is visible by default. On tap we start the
 * action clip underneath, wait until its first frame is actually painted, and
 * only then hide idle (so no frame is dropped). When the clip ends we show idle
 * again, which was parked on frame 0 -- the same image the clip ends on.
 *
 * Every clip is downloaded fully into a blob URL before the avatar is shown, so
 * playback never stalls on the network.
 */

type Rvfc = (cb: () => void) => number;
const onFramePainted = (v: HTMLVideoElement, cb: () => void) => {
  const rvfc = (v as unknown as { requestVideoFrameCallback?: Rvfc })
    .requestVideoFrameCallback;
  if (rvfc) rvfc.call(v, cb);
  else requestAnimationFrame(() => requestAnimationFrame(cb));
};

const regionPath = (r: Region) =>
  r.shape === "rect"
    ? `M${r.x},${r.y}h${r.w}v${r.h}h${-r.w}z`
    : `M${r.points.map((p) => p.join(",")).join("L")}z`;

async function toBlobUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

export default function AvatarPlayer({
  avatar,
  debug = false,
}: {
  avatar: AvatarManifest;
  debug?: boolean;
}) {
  const [urls, setUrls] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idleRef = useRef<HTMLVideoElement>(null);
  const actionRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const busy = useRef(false);

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

  const play = useCallback(async (action: AvatarAction) => {
    const idle = idleRef.current;
    const clip = actionRefs.current[action.id];
    if (!idle || !clip || busy.current) return;
    busy.current = true;

    clip.currentTime = 0;
    try {
      await clip.play();
    } catch {
      busy.current = false;
      return;
    }
    // Hide idle only once the clip's frame is on screen -> no gap.
    onFramePainted(clip, () => {
      idle.pause();
      idle.currentTime = 0; // pre-seek so it's ready to reveal when the clip ends
      idle.style.opacity = "0";
    });

    clip.onended = () => {
      // Idle is parked on frame 0 (= clip's last frame); reveal it.
      const reveal = () => {
        idle.style.opacity = "1";
        void idle.play();
        busy.current = false;
      };
      if (idle.seeking) idle.addEventListener("seeked", reveal, { once: true });
      else reveal();
    };
  }, []);

  if (error) return <p>Failed to load clips: {error}</p>;

  return (
    <div
      style={{
        position: "relative",
        width: "min(100%, 480px)",
        aspectRatio: String(avatar.aspectRatio),
        background: "#000",
        touchAction: "manipulation",
        userSelect: "none",
      }}
    >
      {urls &&
        avatar.actions.map((a) => (
          <video
            key={a.id}
            ref={(el) => {
              actionRefs.current[a.id] = el;
            }}
            src={urls[a.video]}
            muted
            playsInline
            preload="auto"
            style={videoStyle}
          />
        ))}
      {urls ? (
        <video
          ref={idleRef}
          src={urls[avatar.idle]}
          muted
          loop
          autoPlay
          playsInline
          preload="auto"
          style={videoStyle}
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
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        >
          {avatar.actions.map((a) => (
            <path
              key={a.id}
              d={regionPath(a.region)}
              onPointerDown={() => play(a)}
              fill={debug ? "rgba(255,0,100,0.25)" : "transparent"}
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
  );
}

const videoStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "fill",
};
