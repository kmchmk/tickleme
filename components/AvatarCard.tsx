"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { variantGate } from "@/lib/access";
import type { AvatarSummary } from "@/lib/avatars";
import { planTransition } from "@/lib/transition-plan";
import type { VariantKey, Viewer } from "@/lib/types";
import { useHomeTransitions } from "./HomeTransitions";
import Stage, { type StageHandle } from "./Stage";
import { useViewer } from "./viewer";

const LABEL: Record<VariantKey, string> = { jeans: "Jeans", bikini: "Bikini", explicit: "Explicit" };
const labelOf = (a: AvatarSummary, k: VariantKey) => a.variants[k].label ?? LABEL[k];
const ORDER: VariantKey[] = ["jeans", "bikini", "explicit"];
const GUEST: Viewer = { signedIn: false, ageConfirmed: false, owned: [] };

function Lock() {
  return (
    <svg viewBox="0 0 24 24" className="chip-lock" aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/**
 * One avatar, all its outfits. The card shows pictures; pressing an outfit chip plays the transition clips in the
 * card between the pictures (presses during a transition are remembered and played next).
 */
export default function AvatarCard({ avatar }: { avatar: AvatarSummary }) {
  const { viewer } = useViewer();
  const { transitions, urls } = useHomeTransitions();
  const [selected, setSelected] = useState<VariantKey>("jeans"); // the chip
  const [shown, setShown] = useState<VariantKey>("jeans"); // the picture at rest
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState<VariantKey | null>(null);
  const stage = useRef<StageHandle>(null);
  const media = useRef<HTMLDivElement>(null);
  const chips = useRef<Partial<Record<VariantKey, HTMLButtonElement | null>>>({});
  const shownRef = useRef<VariantKey>("jeans");
  const busyRef = useRef(false);
  const queuedRef = useRef<VariantKey | null>(null);

  const gateOf = useCallback((k: VariantKey) => variantGate(avatar.id, { access: avatar.variants[k].access }, viewer ?? GUEST), [avatar, viewer]);
  const v = avatar.variants[shown];
  const open = gateOf(shown).ok;
  const caption = v.free === v.total ? `${v.total} touch spots` : `${v.free} free · ${v.total - v.free} to unlock`;

  const go = async (k: VariantKey) => {
    if (!stage.current) return;
    busyRef.current = true;
    setBusy(true);
    setSelected(k);
    const plan = planTransition(shownRef.current, k, transitions[avatar.id] ?? {}, !gateOf("explicit").ok);
    // Only play the clips once all of them have arrived; until then the pictures simply cross-fade.
    const steps = plan.steps.every((s) => urls[s.clip.key]) ? plan.steps.map((s) => ({ url: urls[s.clip.key], ramp: s.ramp })) : [];
    const chip = chips.current[k];
    chip?.style.setProperty("--p", "0");
    await stage.current.transition(steps, { poster: avatar.variants[k].poster }, (avatar.variants.explicit.blur ?? 0.03) * (media.current?.clientWidth ?? 230), (p) =>
      chip?.style.setProperty("--p", p.toFixed(3)),
    );
    shownRef.current = k;
    setShown(k);
    busyRef.current = false;
    setBusy(false);
    const next = queuedRef.current;
    queuedRef.current = null;
    setQueued(null);
    if (next && next !== k) void go(next);
  };

  const choose = (k: VariantKey) => {
    if (busyRef.current) {
      const target = k === selected ? null : k;
      queuedRef.current = target;
      setQueued(target);
      return;
    }
    if (k === shownRef.current) return;
    void go(k);
  };

  return (
    <div className="card card--avatar">
      <Link href={selected === "jeans" ? `/a/${avatar.id}` : `/a/${avatar.id}?v=${selected}`} className="card-link" aria-label={`Play with ${avatar.name}, ${labelOf(avatar, selected)}`}>
        <div ref={media} className={`card-media ${open || busy ? "" : "card-media--locked"}`} style={{ "--ar": v.aspectRatio } as React.CSSProperties}>
          <Stage ref={stage} initialPoster={avatar.variants.jeans.poster} alt={`${avatar.name}, an interactive tickle avatar you can tap`} />
          {!open && !busy && (
            <span className="lock-badge" aria-hidden>
              <svg viewBox="0 0 24 24">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            </span>
          )}
          {shown !== "jeans" && <span className="pill">18+</span>}
        </div>
      </Link>
      <div className="chips" role="tablist" aria-label={`${avatar.name} outfit`}>
        {ORDER.map((k) => {
          const locked = !gateOf(k).ok;
          const moving = busy && selected === k;
          return (
            <button
              key={k}
              ref={(el) => {
                chips.current[k] = el;
              }}
              type="button"
              role="tab"
              aria-selected={selected === k}
              aria-busy={moving}
              className={`chip ${selected === k ? "chip--on" : ""} ${moving ? "chip--busy" : ""} ${queued === k ? "chip--queued" : ""}`}
              onClick={() => choose(k)}
            >
              {labelOf(avatar, k)}
              {locked && <Lock />}
            </button>
          );
        })}
      </div>
      <div className="card-body">
        <h3 className="card-name">{avatar.name}</h3>
        {avatar.tagline && <p className="card-tagline">{avatar.tagline}</p>}
        <span>{caption}</span>
      </div>
    </div>
  );
}
