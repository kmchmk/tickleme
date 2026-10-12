"use client";

import Link from "next/link";
import { useState } from "react";
import { variantGate } from "@/lib/access";
import type { AvatarSummary } from "@/lib/avatars";
import type { VariantKey, Viewer } from "@/lib/types";
import { useViewer } from "./viewer";

const LABEL: Record<VariantKey, string> = { jeans: "Jeans", bikini: "Bikini", explicit: "Explicit" };
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
  const [selected, setSelected] = useState<VariantKey>("jeans");
  const v = avatar.variants[selected];
  const gate = variantGate(avatar.id, { access: v.access }, viewer ?? GUEST);
  const open = gate.ok;

  const caption =
    selected === "jeans"
      ? `${v.total} touch spots`
      : v.free === v.total
        ? `${v.total} touch spots`
        : `${v.free} free · ${v.total - v.free} to unlock`;

  return (
    <div className="card card--avatar">
      <Link href={`/a/${avatar.id}?v=${selected}`} className="card-link" aria-label={`Open ${avatar.name}, ${LABEL[selected]}`}>
        <div className="card-media" style={{ "--ar": v.aspectRatio } as React.CSSProperties}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={v.poster} alt="" loading="lazy" className={open ? "" : "dim"} />
          {!open && (
            <span className="lock-badge" aria-hidden>
              <svg viewBox="0 0 24 24">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            </span>
          )}
          {selected !== "jeans" && <span className="pill">18+</span>}
        </div>
      </Link>
      <div className="chips" role="tablist" aria-label={`${avatar.name} outfit`}>
        {ORDER.map((k) => {
          const locked = !variantGate(avatar.id, { access: avatar.variants[k].access }, viewer ?? GUEST).ok;
          return (
            <button key={k} type="button" role="tab" aria-selected={selected === k} className={`chip ${selected === k ? "chip--on" : ""}`} onClick={() => setSelected(k)}>
              {LABEL[k]}
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
