"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Stage, { type StageHandle } from "@/components/Stage";
import TouchLayer from "@/components/TouchLayer";
import { usePreload, type Snapshot } from "@/components/usePreload";
import type { AvatarSummary } from "@/lib/avatars";
import type { Display } from "@/lib/stage-engine";
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

// "gate" = the user asked to get past the lock of the outfit on stage (sign in / confirm age / unlock).
type Modal = null | { type: "paywall"; need: "taps" | "explicit" } | { type: "gate" };

const display = (avatar: AvatarSummary, snap: Snapshot, k: VariantKey): Display => {
  const v = snap.bundle.variants[k];
  return { poster: avatar.variants[k].poster, idle: v.status === "open" ? snap.urls[v.manifest.idle.key] : null };
};

/**
 * Full-screen play view. Everything the viewer may see (every outfit and every transition clip) is downloaded up
 * front, so switching outfit never waits: the transition plays and the new outfit is already there. Taps on an
 * outfit button during a transition are remembered and played next, and the button shows the progress.
 */
export default function AvatarScreen({ avatar, initialVariant, debug }: { avatar: AvatarSummary; initialVariant: VariantKey; debug: boolean }) {
  const { viewer, refresh } = useViewer();
  const [bundle, setBundle] = useState<AvatarBundle | null>(null);
  const [bundleFailed, setBundleFailed] = useState(false);
  const [attempt, setAttempt] = useState(0); // "Retry" fetches the bundle again (fresh download links)
  const { snapshot, loading, progress, failed } = usePreload(bundle);
  const reload = useCallback(() => setAttempt((a) => a + 1), []);

  const [variant, setVariant] = useState<VariantKey>(initialVariant); // the highlighted button
  const [shown, setShown] = useState<VariantKey>(initialVariant); // the outfit on stage at rest
  const [busy, setBusy] = useState(false); // a transition is playing
  const [queued, setQueued] = useState<VariantKey | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [hints, setHints] = useState(false);
  const [about, setAbout] = useState(false);
  useEffect(() => {
    if (!about) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAbout(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [about]);
  const [firstVisit, setFirstVisit] = useState(false);

  const stage = useRef<StageHandle>(null);
  const frame = useRef<HTMLDivElement>(null);
  const tabs = useRef<Partial<Record<VariantKey, HTMLButtonElement | null>>>({});
  const snapRef = useRef<Snapshot | null>(null);
  const shownRef = useRef<VariantKey>(initialVariant);
  const busyRef = useRef(false);
  const queuedRef = useRef<VariantKey | null>(null);
  const staleRef = useRef(false); // the snapshot changed during a transition

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
  }, [avatar.id, viewerKey, attempt]);

  // Put the outfit on stage whenever a (new) snapshot is ready: first load, or unlocked/locked in place.
  useEffect(() => {
    if (!snapshot) return;
    const first = !snapRef.current;
    snapRef.current = snapshot;
    if (busyRef.current) {
      staleRef.current = true; // picked up when the transition ends
      return;
    }
    void stage.current?.show(display(avatar, snapshot, shownRef.current), !first);
  }, [snapshot, avatar]);

  // The pictures of every outfit, so landing on one never waits.
  useEffect(() => {
    for (const k of ORDER) new Image().src = avatar.variants[k].poster;
  }, [avatar]);

  useEffect(() => {
    try {
      setFirstVisit(!localStorage.getItem(HINTS_SEEN_KEY));
    } catch {}
  }, []);

  const entry = snapshot?.bundle.variants[shown];
  const manifest = entry?.status === "open" ? entry.manifest : null;
  const gate = entry?.status === "gated" ? entry.gate : null;
  const ready = !!snapshot;

  // First visit: flash the touch spots briefly once the avatar is on screen.
  useEffect(() => {
    if (!ready || !manifest || !firstVisit) return;
    setHints(true);
    const t = setTimeout(() => setHints(false), 2600);
    try {
      localStorage.setItem(HINTS_SEEN_KEY, "1");
    } catch {}
    return () => clearTimeout(t);
  }, [ready, !!manifest, firstVisit]); // eslint-disable-line react-hooks/exhaustive-deps

  // A gate dialog closes by itself once the outfit opens (sign in -> age -> payment continue on their own).
  useEffect(() => {
    if (modal?.type === "gate" && ready && !gate) setModal(null);
  }, [modal, ready, gate]);

  const setTabProgress = (k: VariantKey, p: number) => tabs.current[k]?.style.setProperty("--p", p.toFixed(3));

  const go = useCallback(
    async (k: VariantKey) => {
      const snap = snapRef.current;
      if (!snap || !stage.current) return;
      busyRef.current = true;
      setBusy(true);
      setVariant(k);
      setHints(false);
      const url = new URL(window.location.href);
      url.searchParams.set("v", k);
      window.history.replaceState(null, "", url);

      const from = shownRef.current;
      const plan = planTransition(from, k, snap.bundle.transitions, snap.bundle.variants.explicit.status === "gated");
      const steps = plan.steps.flatMap((s) => (snap.urls[s.clip.key] ? [{ url: snap.urls[s.clip.key], ramp: s.ramp }] : []));
      const blurPx = snap.bundle.explicitBlur * (frame.current?.clientWidth ?? 400);
      setTabProgress(k, 0);
      await stage.current.transition(steps, display(avatar, snap, k), blurPx, (p) => setTabProgress(k, p));

      shownRef.current = k;
      setShown(k);
      busyRef.current = false;
      setBusy(false);
      if (staleRef.current && snapRef.current) {
        staleRef.current = false;
        await stage.current?.show(display(avatar, snapRef.current, k));
      }
      const next = queuedRef.current;
      queuedRef.current = null;
      setQueued(null);
      if (next && next !== k) void go(next);
    },
    [avatar],
  );

  const pick = (k: VariantKey) => {
    if (!snapRef.current) return;
    if (busyRef.current) {
      // Remember only the latest wish; it plays as soon as the current transition ends.
      const target = k === variant ? null : k;
      queuedRef.current = target;
      setQueued(target);
      return;
    }
    if (k === shownRef.current) return;
    void go(k);
  };

  const poster = avatar.variants[shown].poster;
  const lockedCount = manifest ? manifest.actions.filter((a) => a.locked).length : 0;
  const mention = shown === "explicit" ? "The explicit version" : `The ${labelOf(avatar, shown).toLowerCase()} version`;
  const closeGate = () => setModal(null);
  const gateCta =
    gate === "signin"
      ? `Sign in to see the ${labelOf(avatar, shown).toLowerCase()} outfit`
      : gate === "age"
        ? "Confirm you're 18+ to continue"
        : gate === "purchase"
          ? `Unlock · ${priceLabel(avatar.pricing.explicit)} USDC`
          : "";

  return (
    <main className="screen" style={{ "--ar": avatar.variants[shown].aspectRatio } as React.CSSProperties}>
      <div className="screen-backdrop" style={{ backgroundImage: `url(${poster})` }} aria-hidden />

      <header className="screen-bar">
        <Link href="/" className="icon-btn" aria-label="Back to all avatars">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <div className="screen-heading">
          <h1 className="screen-title">{avatar.name}</h1>
          {avatar.bio && (
            <button type="button" className="screen-about" onClick={() => setAbout(true)} aria-haspopup="dialog">
              {avatar.tagline}
              <svg viewBox="0 0 24 24" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v5M12 8h.01" />
              </svg>
            </button>
          )}
        </div>
        <div className="screen-actions">
          <AccountArea />
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Outfit">
        {ORDER.map((k) => {
          const moving = busy && variant === k;
          const locked = snapshot?.bundle.variants[k].status === "gated";
          return (
            <button
              key={k}
              ref={(el) => {
                tabs.current[k] = el;
              }}
              type="button"
              role="tab"
              aria-selected={variant === k}
              aria-busy={moving}
              className={`tab ${variant === k ? "tab--on" : ""} ${moving ? "tab--busy" : ""} ${queued === k ? "tab--queued" : ""}`}
              onClick={() => pick(k)}
            >
              <span className="tab-label">
                {labelOf(avatar, k)}
                {locked && (
                  <svg viewBox="0 0 24 24" className="tab-lock" aria-label="locked">
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                )}
              </span>
              <small>{SUB[k](avatar)}</small>
            </button>
          );
        })}
      </div>

      <div className="stage">
        <div ref={frame} className={`frame ${gate && !busy ? "frame--locked" : ""}`} style={{ backgroundImage: `url(${avatar.variants[initialVariant].poster})` }}>
          <Stage ref={stage} initialPoster={avatar.variants[initialVariant].poster} alt={`${avatar.name}, ${labelOf(avatar, initialVariant)}`} />

          {ready && manifest && !busy && snapshot && (
            <TouchLayer
              manifest={manifest}
              showHints={hints || debug}
              onPlay={(a) => void stage.current?.tap(snapshot.urls[a.key])}
              onLocked={() => setModal({ type: "paywall", need: "taps" })}
            />
          )}

          {ready && gate && !busy && (
            <button type="button" className="gate-lock" aria-label={`Locked. ${gateCta}`} onClick={() => setModal({ type: "gate" })}>
              <svg viewBox="0 0 24 24" aria-hidden>
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            </button>
          )}

          {/* Only on first load: never while switching outfits. */}
          {!ready && !failed && !bundleFailed && (
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
          {(failed || bundleFailed) && !ready && (
            <div className="player-loading">
              <p>Couldn&apos;t load {avatar.name} right now. Check your connection and try again.</p>
              <button type="button" className="btn" onClick={reload}>
                Retry
              </button>
            </div>
          )}
          {ready && !loading && (failed || bundleFailed) && (
            <div className="stage-note stage-note--action" role="alert">
              Couldn&apos;t update.
              <button type="button" onClick={reload}>
                Retry
              </button>
            </div>
          )}
          {ready && loading && (
            <div className="stage-note" role="status">
              <span className="spinner spinner--small" /> Updating… {Math.round(progress * 100)}%
            </div>
          )}
        </div>
      </div>

      <div className={`dock ${ready && !busy ? "" : "dock--hidden"}`}>
        {gate ? (
          <button type="button" className="btn btn--accent" onClick={() => setModal({ type: "gate" })}>
            {gateCta}
          </button>
        ) : (
          <>
            {lockedCount > 0 && (
              <button type="button" className="btn btn--accent" onClick={() => setModal({ type: "paywall", need: "taps" })}>
                Unlock {lockedCount} more spot{lockedCount > 1 ? "s" : ""} · {priceLabel(avatar.pricing.taps)} USDC
              </button>
            )}
            <button type="button" className="btn btn--ghost" aria-pressed={hints} onClick={() => setHints((h) => !h)}>
              {hints ? "Hide touch spots" : "Show touch spots"}
            </button>
            <p className="dock-tip">Tap {avatar.name} anywhere to play</p>
          </>
        )}
      </div>

      {avatar.bio && (
        <div className="modal-backdrop about-back" hidden={!about} onClick={() => setAbout(false)}>
          <section className="modal about" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 id="about-title" className="modal-title">
                About {avatar.name}
              </h2>
              <button type="button" className="modal-close" onClick={() => setAbout(false)} aria-label="Close">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <p className="about-tagline">{avatar.tagline}</p>
            <p className="modal-text">{avatar.bio}</p>
            <h3 className="about-h">How to play</h3>
            <ul className="about-list">
              <li>Tap anywhere on {avatar.name}: every touch spot has its own reaction.</li>
              <li>Not sure where to tap? &ldquo;Show touch spots&rdquo; outlines them all.</li>
              <li>Switch outfits with the buttons at the top.</li>
            </ul>
            <div className="modal-actions">
              <button type="button" className="btn btn--wide" onClick={() => setAbout(false)}>
                Play with {avatar.name}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Gate dialogs only open on request (padlock / button): sign in -> confirm age -> unlock, each continuing on its own. */}
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
