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
const priceLabel = (usdc: number) => usdc.toFixed(2);
const LABEL: Record<VariantKey, string> = { jeans: "Jeans", bikini: "Bikini", explicit: "Explicit" };
const labelOf = (a: AvatarSummary, k: VariantKey) => a.variants[k].label ?? LABEL[k];
const ORDER: VariantKey[] = ["jeans", "bikini", "explicit"];
const SUB: Record<VariantKey, (a: AvatarSummary) => string> = {
  jeans: () => "Open to everyone",
  bikini: () => "Free · members 18+",
  explicit: (a) => `18+ · ${priceLabel(a.pricing.explicit)} USDC`,
};

type Load =
  | { status: "loading" }
  | { status: "ready"; manifest: PlayerManifest }
  | { status: "gated"; reason: "signin" | "age" | "purchase" }
  | { status: "error" };

// "gate" = the user asked to continue past the gate (Unlock button); "closed" = they dismissed an auto-opened gate dialog.
type Modal = null | { type: "paywall"; need: "taps" | "explicit" } | { type: "gate" } | { type: "closed" };

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
    // Keep an "Unlock" click alive across the reload, so sign-in -> age -> payment continue on their own.
    setModal((m) => (m?.type === "gate" || m?.type === "paywall" ? m : null));
    fetch(`/api/avatars/${avatar.id}/${variant}`, { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          setModal((m) => (m?.type === "gate" ? null : m));
          return setLoad({ status: "ready", manifest: (await res.json()) as PlayerManifest });
        }
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
  const lockedCount = manifest ? manifest.actions.filter((a) => a.locked).length : 0;
  const mention = variant === "explicit" ? "The explicit version" : `The ${labelOf(avatar, variant).toLowerCase()} version`;
  const autoOpen = variant !== "explicit";
  const showGate = autoOpen ? modal?.type !== "closed" && modal?.type !== "paywall" : modal?.type === "gate";
  const dismissGate = () => setModal(autoOpen ? { type: "closed" } : null);

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
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Outfit">
        {ORDER.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={variant === k} className={`tab ${variant === k ? "tab--on" : ""}`} onClick={() => pick(k)}>
            <span>{labelOf(avatar, k)}</span>
            <small>{SUB[k](avatar)}</small>
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
            <div className="teaser">
              <span className="teaser-badge">{variant === "explicit" ? "Explicit · 18+" : "Members only · 18+"}</span>
              <p className="teaser-text">
                {gate === "signin" ? "Sign in to see this outfit" : gate === "age" ? "Confirm your age to continue" : "Unlock the explicit version"}
              </p>
              {gate === "purchase" && <p className="teaser-price">{priceLabel(avatar.pricing.explicit)} USDC · or the bundle for {priceLabel(avatar.pricing.bundle)}</p>}
              <button type="button" className="btn" onClick={() => setModal({ type: "gate" })}>
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

      <div className={`dock ${ready ? "" : "dock--hidden"}`}>
        {lockedCount > 0 && (
          <button type="button" className="btn btn--accent" onClick={() => setModal({ type: "paywall", need: "taps" })}>
            Unlock {lockedCount} more spot{lockedCount > 1 ? "s" : ""} · {priceLabel(avatar.pricing.taps)} USDC
          </button>
        )}
        <button type="button" className="btn btn--ghost" aria-pressed={hints} onClick={() => setHints((h) => !h)}>
          {hints ? "Hide touch spots" : "Show touch spots"}
        </button>
        <p className="dock-tip">Tap {avatar.name} anywhere to play</p>
      </div>

      {/* Gate dialogs. The bikini outfit opens its sign-in / age dialog by itself; the explicit outfit first
          shows the blurred teaser, and its dialogs (sign-in, age, payment) only open when the user clicks Unlock. */}
      {gate && showGate && (
        <>
          {gate === "signin" && <SignInModal why={`The ${labelOf(avatar, variant).toLowerCase()} outfit is for signed-in members.`} onClose={dismissGate} />}
          {gate === "age" && <AgeModal mention={mention} onConfirmed={() => void refresh()} onClose={dismissGate} />}
          {gate === "purchase" && <PaywallModal avatar={avatar} need="explicit" onClose={dismissGate} onPaid={() => void refresh()} />}
        </>
      )}
      {modal?.type === "paywall" &&
        (!viewer?.signedIn ? (
          <SignInModal why="Sign in to unlock more touch spots." onClose={() => setModal(null)} />
        ) : !viewer.ageConfirmed ? (
          <AgeModal mention="The extra touch spots" onConfirmed={() => void refresh()} onClose={() => setModal(null)} />
        ) : (
          <PaywallModal avatar={avatar} need={modal.need} onClose={() => setModal(null)} onPaid={() => void refresh()} />
        ))}
    </main>
  );
}
