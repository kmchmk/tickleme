"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AvatarPlayer from "@/components/AvatarPlayer";
import { assetUrl } from "@/lib/avatars";
import type { AvatarManifest } from "@/lib/types";

const HINTS_SEEN_KEY = "tickleme:hints-seen";

/** Full-screen play view: blurred ambient backdrop, top bar, and the avatar fitted to any screen. */
export default function AvatarScreen({ avatar, debug }: { avatar: AvatarManifest; debug: boolean }) {
  const [hints, setHints] = useState(false);
  const [ready, setReady] = useState(false);
  const [firstVisit, setFirstVisit] = useState(false);

  useEffect(() => {
    try {
      setFirstVisit(!localStorage.getItem(HINTS_SEEN_KEY));
    } catch {}
  }, []);

  const onReady = useCallback(() => setReady(true), []);

  // First visit: flash the touch spots briefly once the avatar is ready.
  useEffect(() => {
    if (!ready || !firstVisit) return;
    setHints(true);
    const t = setTimeout(() => setHints(false), 2600);
    try {
      localStorage.setItem(HINTS_SEEN_KEY, "1");
    } catch {}
    return () => clearTimeout(t);
  }, [ready, firstVisit]);

  const poster = avatar.poster ? assetUrl(avatar, avatar.poster) : undefined;

  return (
    <main className="screen" style={{ "--ar": avatar.aspectRatio } as React.CSSProperties}>
      {poster && <div className="screen-backdrop" style={{ backgroundImage: `url(${poster})` }} aria-hidden />}

      <header className="screen-bar">
        <Link href="/" className="icon-btn" aria-label="Back to all pets">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <h1 className="screen-title">{avatar.name}</h1>
        <button
          type="button"
          className={`icon-btn ${hints ? "icon-btn--on" : ""}`}
          aria-pressed={hints}
          aria-label={hints ? "Hide touch spots" : "Show touch spots"}
          onClick={() => setHints((h) => !h)}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />
          </svg>
        </button>
      </header>

      <div className="stage">
        <div
          className="frame"
          style={poster ? { backgroundImage: `url(${poster})` } : undefined}
        >
          <AvatarPlayer avatar={avatar} showHints={hints} debug={debug} onReady={onReady} />
        </div>
      </div>

      <p className={`screen-tip ${ready ? "" : "screen-tip--hidden"}`}>
        Tap {avatar.name} anywhere — {avatar.actions.length} spots to find
      </p>
    </main>
  );
}
