"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { variantGate } from "@/lib/access";
import type { AvatarSummary } from "@/lib/avatars";
import type { VariantKey, Viewer } from "@/lib/types";
import { useHomeTransitions } from "./HomeTransitions";
import TransitionLayer, { type LayerHandle } from "./TransitionLayer";
import { planTransition } from "@/lib/transition-plan";
import { useViewer } from "./viewer";

const LABEL: Record<VariantKey, string> = { jeans: "Jeans", bikini: "Bikini", explicit: "Explicit" };
const labelOf = (avatar: AvatarSummary, k: VariantKey) => avatar.variants[k].label ?? LABEL[k];
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

/** One avatar, all its variants: pick the outfit with the chips. */
export default function AvatarCard({ avatar }: { avatar: AvatarSummary }) {
  const { viewer } = useViewer();
  const { transitions, urls } = useHomeTransitions();
  const [selected, setSelected] = useState<VariantKey>("jeans"); // the chip
  const [shown, setShown] = useState<VariantKey>("jeans"); // the picture on the card
  const [busy, setBusy] = useState(false);
  const layer = useRef<LayerHandle>(null);
  const media = useRef<HTMLDivElement>(null);
  const v = avatar.variants[shown];
  const gateOf = (k: VariantKey) => variantGate(avatar.id, { access: avatar.variants[k].access }, viewer ?? GUEST);
  const open = gateOf(shown).ok;

  const caption = v.free === v.total ? `${v.total} touch spots` : `${v.free} free · ${v.total - v.free} to unlock`;

  const preload = (src: string) => new Promise<void>((r) => { const i = new Image(); i.onload = i.onerror = () => r(); i.src = src; });

  // Pressing a chip plays the transition clips between the pictures (when they have arrived; otherwise the picture swaps).
  const choose = async (k: VariantKey) => {
    if (busy || k === selected) return;
    setSelected(k);
    const mine = transitions[avatar.id] ?? {};
    const plan = planTransition(shown, k, mine, !gateOf("explicit").ok);
    const steps = plan.steps.flatMap((s) => (urls[s.clip.key] ? [{ ...s, src: urls[s.clip.key] }] : []));
    if (!steps.length || steps.length < plan.steps.length || !layer.current) return setShown(k);
    setBusy(true);
    await preload(avatar.variants[k].poster); // the picture under the clip must be there when it fades away
    await layer.current.begin({ steps, blurPx: (avatar.variants.explicit.blur ?? 0.03) * (media.current?.clientWidth ?? 230) });
    await layer.current.run();
    setShown(k); // the picture underneath becomes the new outfit, then the clip fades onto it
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await layer.current.release();
    setBusy(false);
  };

  return (
    <div className="card card--avatar">
      <Link href={`/a/${avatar.id}?v=${selected}`} className="card-link" aria-label={`Open ${avatar.name}, ${labelOf(avatar, selected)}`}>
        <div ref={media} className="card-media" style={{ "--ar": v.aspectRatio } as React.CSSProperties}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={v.poster} alt="" loading="lazy" className={open ? "" : "dim"} />
          <TransitionLayer ref={layer} />
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
          return (
            <button key={k} type="button" role="tab" aria-selected={selected === k} disabled={busy} className={`chip ${selected === k ? "chip--on" : ""}`} onClick={() => void choose(k)}>
              {labelOf(avatar, k)}
              {locked && <Lock />}
            </button>
          );
        })}
      </div>
      <div className="card-body">
        <strong>{avatar.name}</strong>
        <span>{caption}</span>
      </div>
    </div>
  );
}
