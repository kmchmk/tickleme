"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { blurAmount, type Step } from "@/lib/transition-plan";

/** Cross-fade lengths (ms): from the frame that was showing into the first clip, between clips, and out at the end. */
const START_FADE = 180;
const JOIN_FADE = 140;
const END_FADE = 240;

export interface LayerStep extends Step {
  /** Blob URL of the clip. */
  src: string;
}

export interface LayerHandle {
  /**
   * Cover the stage and get ready: renders the clips, freezes the current frame (when `draw` is given; otherwise the
   * picture underneath is the starting point) and waits until every clip can start instantly.
   */
  begin: (o: { steps: LayerStep[]; draw?: (c: HTMLCanvasElement) => void; blurPx: number }) => Promise<void>;
  /** Plays the clips in order. Resolves when the last one has ended; its final frame stays on screen. */
  run: () => Promise<void>;
  /** Fades the layer away (revealing whatever is underneath) and clears it. */
  release: () => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const once = (el: HTMLVideoElement, ev: string) => new Promise<void>((r) => el.addEventListener(ev, () => r(), { once: true }));

/** iOS only honours muted inline playback when the attributes are present. */
const prep = (el: HTMLVideoElement | null) => {
  if (!el) return;
  el.muted = true;
  el.defaultMuted = true;
  el.setAttribute("muted", "");
  el.setAttribute("playsinline", "");
  el.setAttribute("webkit-playsinline", "");
};

/**
 * Plays outfit-transition clips on top of the picture, with no loading state: clips come from memory, the first
 * frame is cross-faded in from what was showing, clips join with a short cross-fade, and while the explicit outfit
 * is blurred for this viewer the picture gradually blurs (or un-blurs) to match the blurred teaser.
 */
const TransitionLayer = forwardRef<LayerHandle>(function TransitionLayer(_props, handle) {
  const [steps, setSteps] = useState<LayerStep[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const snap = useRef<HTMLCanvasElement>(null);
  const vids = useRef<(HTMLVideoElement | null)[]>([]);
  const job = useRef<{ steps: LayerStep[]; blurPx: number; durations: number[] } | null>(null);

  const setBlur = (px: number) => {
    if (root.current) root.current.style.filter = px > 0.2 ? `blur(${px}px)` : "";
  };

  useImperativeHandle(handle, () => ({
    async begin({ steps: s, draw, blurPx }) {
      const el = root.current!;
      vids.current = [];
      flushSync(() => setSteps(s));
      const c = snap.current!;
      if (draw) {
        draw(c);
        c.style.transition = "none";
        c.style.opacity = "1";
      } else {
        c.style.transition = "none";
        c.style.opacity = "0";
      }
      el.style.transition = "none";
      el.style.opacity = "1";
      el.style.pointerEvents = "auto";
      const list = vids.current.filter(Boolean) as HTMLVideoElement[];
      list.forEach((v, i) => {
        prep(v);
        v.style.transition = "none";
        v.style.opacity = "0";
        v.style.zIndex = String(2 + i);
      });
      // every clip must be able to start at once
      await Promise.all(list.map((v) => (v.readyState >= 2 ? Promise.resolve() : Promise.race([once(v, "loadeddata"), wait(3000)]))));
      const durations = list.map((v) => (Number.isFinite(v.duration) ? v.duration : 2.5));
      job.current = { steps: s, blurPx, durations };
      // start blurred if the first clip is on the "un-blur" ramp
      setBlur(s[0]?.ramp ? blurAmount(s, 0, 0, durations) * blurPx : 0);
    },

    async run() {
      const j = job.current;
      const list = vids.current.filter(Boolean) as HTMLVideoElement[];
      if (!j || !list.length) return;
      let raf = 0;
      let current = 0;
      const tick = () => {
        const v = list[current];
        if (v) setBlur(blurAmount(j.steps, current, v.currentTime, j.durations) * j.blurPx);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      for (let i = 0; i < list.length; i++) {
        const v = list[i];
        current = i;
        v.currentTime = 0;
        const ended = once(v, "ended");
        try {
          await v.play();
        } catch {
          continue; // a clip that cannot play is skipped; the layer still ends on the last good frame
        }
        v.style.transition = `opacity ${i === 0 ? START_FADE : JOIN_FADE}ms linear`;
        v.style.opacity = "1";
        if (i === 0 && snap.current) {
          snap.current.style.transition = `opacity ${START_FADE}ms linear`;
          snap.current.style.opacity = "0";
        }
        await ended;
      }
      cancelAnimationFrame(raf);
      const last = j.steps[j.steps.length - 1];
      setBlur(last?.ramp ? blurAmount(j.steps, j.steps.length - 1, 1e9, j.durations) * j.blurPx : 0);
    },

    async release() {
      const el = root.current!;
      el.style.transition = `opacity ${END_FADE}ms ease`;
      el.style.opacity = "0";
      await wait(END_FADE + 40);
      el.style.pointerEvents = "none";
      el.style.filter = "";
      vids.current = [];
      flushSync(() => setSteps([]));
      job.current = null;
    },
  }));

  return (
    <div ref={root} className="tlayer" aria-hidden style={{ opacity: 0, pointerEvents: "none" }}>
      <canvas ref={snap} className="tlayer-media" style={{ zIndex: 1, opacity: 0 }} />
      {steps.map((s, i) => (
        <video key={`${i}:${s.clip.key}`} ref={(el) => { vids.current[i] = el; }} src={s.src} muted playsInline preload="auto" className="tlayer-media" />
      ))}
    </div>
  );
});

export default TransitionLayer;
