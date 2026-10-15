"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import AvatarPlayer, { type PlayerHandle } from "@/components/AvatarPlayer";
import TransitionLayer, { type LayerHandle } from "@/components/TransitionLayer";
import { usePreload } from "@/components/usePreload";
import type { AvatarSummary } from "@/lib/avatars";
import { planTransition } from "@/lib/transition-plan";
import type { AvatarBundle, VariantKey } from "@/lib/types";
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
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// "gate" = the user tapped the padlock of an outfit they can't open yet (sign in / confirm age / unlock).
type Modal = null | { type: "paywall"; need: "taps" | "explicit" } | { type: "gate" };

/**
 * Full-screen play view. Everything the viewer may see (every outfit and every transition clip) is downloaded up
 * front, so switching outfit never waits: the transition clips play, and the new outfit is already there.
 */
export default function AvatarScreen({ avatar, initialVariant, debug }: { avatar: AvatarSummary; initialVariant: VariantKey; debug: boolean }) {
  const { viewer, refresh } = useViewer();
  const [bundle, setBundle] = useState<AvatarBundle | null>(null);
  const [bundleFailed, setBundleFailed] = useState(false);
  const { urls, progress, failed, retry } = usePreload(bundle);

  const [variant, setVariant] = useState<VariantKey>(initialVariant); // the selected tab
  const [shown, setShown] = useState<VariantKey>(initialVariant); // what is on stage (under any transition)
  const [settled, setSettled] = useState<VariantKey>(initialVariant); // what the backdrop shows; changes when a transition ends
  const [busy, setBusy] = useState(false); // a transition is playing
  const [hold, setHold] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [hints, setHints] = useState(false);
  const [firstVisit, setFirstVisit] = useState(false);

  const layer = useRef<LayerHandle>(null);
  const player = useRef<PlayerHandle>(null);
  const frame = useRef<HTMLDivElement>(null);
  const readyResolver = useRef<(() => void) | null>(null);

  // (Re)load the bundle whenever who is looking changes (sign-in, age confirmed, purchase, admin grant).
  const viewerKey = useMemo(() => (viewer ? JSON.stringify(viewer) : ""), [viewer]);
  useEffect(() => {
    if (!viewer) return;
    let cancelled = false;
    setBundleFailed(false);
    fetch(`/api/avatars/${avatar.id}`, { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) return setBundleFailed(true);
        setBundle((await res.json()) as AvatarBundle);
      })
      .catch(() => !cancelled && setBundleFailed(true));
    return () => {
      cancelled = true;
    };
    // viewerKey stands in for `viewer`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatar.id, viewerKey]);

  // The pictures of every outfit, so a cross-fade onto one never waits.
  useEffect(() => {
    for (const k of ORDER) new Image().src = avatar.variants[k].poster;
  }, [avatar]);

  useEffect(() => {
    try {
      setFirstVisit(!localStorage.getItem(HINTS_SEEN_KEY));
    } catch {}
  }, []);

  const entry = bundle?.variants[shown];
  const manifest = entry?.status === "open" ? entry.manifest : null;
  const gate = entry?.status === "gated" ? entry.gate : null;
  const explicitBlurred = bundle?.variants.explicit.status === "gated";
  const loaded = !!bundle && !!urls;

  // First visit: flash the touch spots briefly once the avatar is on screen.
  useEffect(() => {
    if (!loaded || !manifest || !firstVisit) return;
    setHints(true);
    const t = setTimeout(() => setHints(false), 2600);
    try {
      localStorage.setItem(HINTS_SEEN_KEY, "1");
    } catch {}
    return () => clearTimeout(t);
  }, [loaded, !!manifest, firstVisit]); // eslint-disable-line react-hooks/exhaustive-deps

  // A gate dialog closes by itself once the outfit opens (signed in -> age -> payment continue on their own).
  useEffect(() => {
    if (modal?.type === "gate" && loaded && !gate) setModal(null);
  }, [modal, loaded, gate]);

  const pick = async (k: VariantKey) => {
    if (busy || k === variant) return;
    const url = new URL(window.location.href);
    url.searchParams.set("v", k);
    window.history.replaceState(null, "", url);
    setVariant(k);
    if (!bundle || !urls || !layer.current) {
      setShown(k);
      setSettled(k);
      return;
    }
    setBusy(true);
    setHints(false);
    const plan = planTransition(shown, k, bundle.transitions, !!explicitBlurred);
    const steps = plan.steps.flatMap((s) => (urls[s.clip.key] ? [{ ...s, src: urls[s.clip.key] }] : []));
    const targetOpen = bundle.variants[k].status === "open";
    const p = player.current;
    // 1. cover the stage with the frame that is showing now, 2. put the new outfit on stage underneath,
    // 3. play the clips, 4. once the new idle is ready, fade the layer away onto it.
    await layer.current.begin({ steps, draw: p ? (c) => p.drawFrameTo(c) : undefined, blurPx: bundle.explicitBlur * (frame.current?.clientWidth ?? 400) });
    const ready = targetOpen ? new Promise<void>((r) => (readyResolver.current = r)) : Promise.resolve();
    flushSync(() => {
      setShown(k);
      setHold(true);
    });
    await layer.current.run();
    await Promise.race([ready, wait(4000)]);
    player.current?.start();
    await layer.current.release();
    setSettled(k);
    setHold(false);
    setBusy(false);
  };

  const poster = avatar.variants[shown].poster;
  const backdrop = avatar.variants[settled].poster;
  const lockedCount = manifest ? manifest.actions.filter((a) => a.locked).length : 0;
  const mention = shown === "explicit" ? "The explicit version" : `The ${labelOf(avatar, shown).toLowerCase()} version`;
  const closeGate = () => setModal(null);

  return (
    <main className="screen" style={{ "--ar": avatar.variants[shown].aspectRatio } as React.CSSProperties}>
      <div className="screen-backdrop" style={{ backgroundImage: `url(${backdrop})` }} aria-hidden />

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
          <button key={k} type="button" role="tab" aria-selected={variant === k} disabled={busy} className={`tab ${variant === k ? "tab--on" : ""}`} onClick={() => void pick(k)}>
            <span>{labelOf(avatar, k)}</span>
            <small>{SUB[k](avatar)}</small>
          </button>
        ))}
      </div>

      <div className="stage">
        <div ref={frame} className={`frame ${gate ? "frame--locked" : ""}`} style={{ backgroundImage: `url(${poster})` }}>
          {loaded && manifest && (
            <AvatarPlayer
              key={`${shown}:${manifest.version}:${lockedCount}`}
              ref={player}
              manifest={manifest}
              urls={urls}
              hold={hold}
              showHints={hints}
              debug={debug}
              onReady={() => readyResolver.current?.()}
              onLockedTap={() => setModal({ type: "paywall", need: "taps" })}
            />
          )}
          {loaded && gate && (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={poster} className="frame-poster" src={poster} alt="" />
          )}
          <TransitionLayer ref={layer} />

          {loaded && gate && !busy && (
            <button
              type="button"
              className="gate-lock"
              aria-label={gate === "signin" ? "Locked. Sign in to see this outfit" : gate === "age" ? "Locked. Confirm your age to continue" : "Locked. Unlock this outfit"}
              onClick={() => setModal({ type: "gate" })}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            </button>
          )}

          {/* Only on first load (and when who is looking changes): never while switching outfits. */}
          {!loaded && !failed && !bundleFailed && (
            <div className="player-loading" role="status" aria-live="polite">
              <svg viewBox="0 0 36 36" className="progress-ring" aria-hidden>
                <circle cx="18" cy="18" r="15.5" className="progress-track" />
                <circle cx="18" cy="18" r="15.5" className="progress-value" strokeDasharray={`${progress * 97.4} 97.4`} />
              </svg>
              <span>
                Waking up {avatar.name}… {Math.round(progress * 100)}%
              </span>
            </div>
          )}
          {(failed || bundleFailed) && (
            <div className="player-loading">
              <p>Couldn&apos;t load {avatar.name} right now. Check your connection and try again.</p>
              <button type="button" className="btn" onClick={() => (bundleFailed ? window.location.reload() : retry())}>
                Retry
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={`dock ${loaded && !busy && !gate ? "" : "dock--hidden"}`}>
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

      {/* Gate dialogs only open when the padlock is tapped: sign in -> confirm age -> unlock, each continuing on its own. */}
      {gate && modal?.type === "gate" && (
        <>
          {gate === "signin" && <SignInModal why={`The ${labelOf(avatar, shown).toLowerCase()} outfit is for signed-in members.`} onClose={closeGate} />}
          {gate === "age" && <AgeModal mention={mention} onConfirmed={() => void refresh()} onClose={closeGate} />}
          {gate === "purchase" && <PaywallModal avatar={avatar} need="explicit" onClose={closeGate} onPaid={() => void refresh()} />}
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
