// Pure planning of outfit transitions (no browser or server imports) so it can be unit-tested directly.
import type { ClipRef, TransitionSet, VariantKey } from "./types";

export const ORDER: VariantKey[] = ["jeans", "bikini", "explicit"];

export interface Step {
  clip: ClipRef;
  /** Part of the bikini <-> explicit pair while the explicit outfit is blurred for this viewer:
   *  "in" = gets gradually blurrier, "out" = gets gradually sharper. */
  ramp?: "in" | "out";
}

export interface Plan {
  steps: Step[];
  /** True when the clips lead all the way to the target; otherwise the last frame cross-fades into it. */
  complete: boolean;
}

type Available = Partial<Record<"jeans" | "bikini", TransitionSet>>;

/**
 * The clips to play to get from one outfit to another, in order.
 *  - Going up (jeans -> bikini -> explicit) each pair plays its `up` clips; going down, its `down` clips.
 *  - A pair belongs to its lower outfit and is only there if the viewer may play it; the chain stops at the first missing pair.
 *  - While the explicit outfit is blurred for the viewer, the clips of the bikini <-> explicit pair ramp the blur.
 */
export function planTransition(from: VariantKey, to: VariantKey, available: Available, explicitBlurred: boolean): Plan {
  const a = ORDER.indexOf(from);
  const b = ORDER.indexOf(to);
  const steps: Step[] = [];
  let complete = true;
  if (b > a) {
    for (let i = a; i < b; i++) {
      const set = available[ORDER[i] as "jeans" | "bikini"];
      if (!set) { complete = false; break; }
      const ramp = explicitBlurred && ORDER[i] === "bikini" ? ("in" as const) : undefined;
      steps.push(...set.up.map((clip) => ({ clip, ramp })));
    }
  } else if (b < a) {
    for (let i = a - 1; i >= b; i--) {
      const set = available[ORDER[i] as "jeans" | "bikini"];
      if (!set) { complete = false; break; }
      const ramp = explicitBlurred && ORDER[i] === "bikini" ? ("out" as const) : undefined;
      steps.push(...set.down.map((clip) => ({ clip, ramp })));
    }
  }
  return { steps, complete: complete && steps.length > 0 };
}

/** Blur (0..1) at a moment of the transition: progress through the ramping steps, per the direction of the ramp. */
export function blurAmount(steps: Step[], index: number, within: number, durations: number[]): number {
  const ramping = steps.map((s, i) => (s.ramp ? i : -1)).filter((i) => i >= 0);
  if (!ramping.length) return 0;
  const dir = steps[ramping[0]].ramp!;
  const total = ramping.reduce((t, i) => t + (durations[i] || 1), 0);
  let done = 0;
  for (const i of ramping) {
    if (i < index) done += durations[i] || 1;
    else if (i === index) done += Math.min(Math.max(within, 0), durations[i] || 1);
  }
  const progress = Math.min(1, done / total);
  // before the ramp starts the blur is the "start" value of its direction, after it ends the "end" value
  return dir === "in" ? progress : 1 - progress;
}
