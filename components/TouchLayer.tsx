"use client";

import { useState, useRef } from "react";
import type { PlayerAction, PlayerManifest, Region } from "@/lib/types";

type Ripple = { id: number; x: number; y: number; label?: string };

const regionPath = (region: Region | Region[]) =>
  [region]
    .flat()
    .map((r) => (r.shape === "rect" ? `M${r.x},${r.y}h${r.w}v${r.h}h${-r.w}z` : `M${r.points.map((p) => p.join(",")).join("L")}z`))
    .join("");

/** Centre of a zone in frame percent (area-weighted over its rectangles). */
const regionCenter = (region: Region | Region[]): [number, number] => {
  let sx = 0,
    sy = 0,
    sa = 0;
  for (const r of [region].flat()) {
    if (r.shape !== "rect") continue;
    sx += (r.x + r.w / 2) * r.w * r.h;
    sy += (r.y + r.h / 2) * r.w * r.h;
    sa += r.w * r.h;
  }
  return sa ? [sx / sa, sy / sa] : [50, 50];
};

/** "Kick (left leg)" -> "Kick" */
const shortLabel = (label: string) => label.replace(/\s*\(.*\)\s*$/, "");

/**
 * The touchable areas over the avatar: an exact, gap-free partition of the body (one zone per area), a ripple where
 * the finger landed, and — while "Show touch spots" is on — dashed outlines and padlocks on the paid areas.
 */
export default function TouchLayer({
  manifest,
  showHints,
  onPlay,
  onLocked,
}: {
  manifest: PlayerManifest;
  showHints: boolean;
  onPlay: (action: PlayerAction) => void;
  onLocked: (action: PlayerAction) => void;
}) {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const rippleId = useRef(0);

  const onTap = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 100;
    const y = ((e.clientY - box.top) / box.height) * 100;
    const id = (e.target as Element).closest("[data-action]")?.getAttribute("data-action");
    const action = manifest.actions.find((a) => a.id === id);
    const ripple = { id: ++rippleId.current, x, y, label: action && !action.locked ? shortLabel(action.label) : undefined };
    setRipples((r) => [...r.slice(-4), ripple]);
    setTimeout(() => setRipples((r) => r.filter((p) => p.id !== ripple.id)), 900);
    if (!action) return;
    if (action.locked) onLocked(action);
    else onPlay(action);
  };

  return (
    <>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="player-hits" onPointerUp={onTap} role="group" aria-label={`Touch ${manifest.name}`}>
        {manifest.actions.map((a) => (
          <path key={a.id} data-action={a.id} d={regionPath(a.region)} className="hit" shapeRendering="crispEdges">
            <title>{a.label}</title>
          </path>
        ))}
        {showHints &&
          manifest.actions.map((a) => (
            <path key={`o-${a.id}`} d={a.outline} className={`hit-outline ${a.locked ? "hit-outline--locked" : ""}`} vectorEffect="non-scaling-stroke" />
          ))}
      </svg>

      {/* Padlocks only show while "Show touch spots" is on; before that a locked spot looks like any other. */}
      {showHints && (
        <div className="hint-dots" aria-hidden>
          {manifest.actions
            .filter((a) => a.locked)
            .map((a) => {
              const [x, y] = regionCenter(a.region);
              return (
                <span key={a.id} className="lock-dot" style={{ left: `${x}%`, top: `${y}%` }}>
                  <svg viewBox="0 0 24 24">
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                </span>
              );
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
    </>
  );
}
