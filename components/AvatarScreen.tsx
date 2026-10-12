"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AvatarPlayer from "@/components/AvatarPlayer";
import type { AvatarSummary } from "@/lib/avatars";
import type { PlayerManifest, VariantKey } from "@/lib/types";
import { AccountArea } from "./AuthControls";
import { AgeModal, PaywallModal, SignInModal } from "./modals";
import { useViewer } from "./viewer";

const HINTS_SEEN_KEY = "tickleme:hints-seen";
const LABEL: Record<VariantKey, string> = { jeans: "Jeans", bikini: "Bikini", explicit: "Explicit" };
const ORDER: VariantKey[] = ["jeans", "bikini", "explicit"];

type Load =
  | { status: "loading" }
  | { status: "ready"; manifest: PlayerManifest }
  | { status: "gated"; reason: "signin" | "age" | "purchase" }
  | { status: "error" };

type Modal = null | { type: "paywall"; need: "taps" | "explicit" } | { type: "closed-gate" };

/** Full-screen play view: blurred ambient backdrop, top bar, outfit switcher and the avatar fitted to any screen. */
export default function AvatarScreen({ avatar, initialVariant, debug }: { avatar: AvatarSummary; initialVariant: VariantKey; debug: boolean }) {
  const { viewer, refresh } = useViewer();
  const [variant, setVariant] = useState<VariantKey>(initialVariant);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [modal, setModal] = useState<Modal>(null);
  const [hints, setHints] = useState(false);
  const [ready, setReady] = useState(false);
  const [firstVisit, setFirstVisit] = useState(false);

  // Reload the manifest whenever the variant or what the viewer owns/can do changes.
  const viewerKey = useMemo(() => (viewer ? JSON.stringify(viewer) : ""), [viewer]);
  useEffect(() => {
    if (!viewer) return; // wait for the first /api/me answer
    let cancelled = false;
    setLoad({ status: "loading" });
    setReady(false);
    setModal(null);
    fetch(`/api/avatars/${avatar.id}/${variant}`, { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) return setLoad({ status: "ready", manifest: (await res.json()) as PlayerManifest });
        if (res.status === 401 || res.status === 403) {
          const { gate } = (await res.json()) as { gate: "signin" | "age" | "purchase" };
          return setLoad({ status: "gated", reason: gate });
        }
        setLoad({ status: "error" });
      })
      .catch(() => !cancelled && setLoad({ status: "error" }));
    return () => {
      cancelled = true;
    };
    // viewerKey stands in for `viewer`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatar.id, variant, viewerKey]);

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

  const pick = (v: VariantKey) => {
    setVariant(v);
    const url = new URL(window.location.href);
    url.searchParams.set("v", v);
    window.history.replaceState(null, "", url);
  };

  const poster = avatar.variants[variant].poster;
  const manifest = load.status === "ready" ? load.manifest : null;
  const gate = load.status === "gated" ? load.reason : null;
  const mention = variant === "explicit" ? "The explicit version" : "The bikini version";

  return (
    <main className="screen" style={{ "--ar": avatar.variants[variant].aspectRatio } as React.CSSProperties}>
      <div className="screen-backdrop" style={{ backgroundImage: `url(${poster})` }} aria-hidden />

      <header className="screen-bar">
        <Link href="/" className="icon-btn" aria-label="Back to all avatars">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <h1 className="screen-title">{avatar.name}</h1>
        <div className="screen-actions">
          <AccountArea />
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
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Outfit">
        {ORDER.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={variant === k} className={`tab ${variant === k ? "tab--on" : ""}`} onClick={() => pick(k)}>
            {LABEL[k]}
          </button>
        ))}
      </div>

      <div className="stage">
        <div className="frame" style={{ backgroundImage: `url(${poster})` }}>
          {manifest && (
            <AvatarPlayer
              key={`${manifest.variant}:${manifest.actions.filter((a) => a.locked).length}`}
              manifest={manifest}
              showHints={hints}
              debug={debug}
              onReady={onReady}
              onLockedTap={() => setModal({ type: "paywall", need: "taps" })}
            />
          )}
          {(load.status === "loading" || !viewer) && (
            <div className="player-loading" role="status">
              <span className="spinner" />
            </div>
          )}
          {gate && (
            <div className="player-loading player-gate">
              <p className="gate-text">{gate === "signin" ? "Sign in to see this outfit" : gate === "age" ? "Confirm your age to continue" : "Locked: unlock to play"}</p>
              <button type="button" className="btn" onClick={() => setModal({ type: "closed-gate" })}>
                {gate === "signin" ? "Sign in" : gate === "age" ? "Continue" : "Unlock"}
              </button>
            </div>
          )}
          {load.status === "error" && (
            <div className="player-loading">
              <p>Couldn&apos;t load this right now. Please try again.</p>
              <button type="button" className="btn" onClick={() => pick(variant)}>
                Retry
              </button>
            </div>
          )}
        </div>
      </div>

      <p className={`screen-tip ${ready ? "" : "screen-tip--hidden"}`}>
        {manifest && manifest.actions.some((a) => a.locked) ? "Tap the 🔒 spots to unlock more" : `Tap ${avatar.name} anywhere to play`}
      </p>

      {/* Gate dialogs: shown automatically for sign-in / age, and on demand for purchases. */}
      {gate === "signin" && modal === null && <SignInModal why={`The ${LABEL[variant].toLowerCase()} outfit is for signed-in members.`} onClose={() => setModal({ type: "closed-gate" })} />}
      {gate === "age" && modal === null && <AgeModal mention={mention} onConfirmed={() => void refresh()} />}
      {gate === "purchase" && modal === null && <PaywallModal avatar={avatar} need="explicit" onClose={() => setModal({ type: "closed-gate" })} onPaid={() => void refresh()} />}
      {modal?.type === "paywall" && <PaywallModal avatar={avatar} need={modal.need} onClose={() => setModal(null)} onPaid={() => void refresh()} />}
    </main>
  );
}
