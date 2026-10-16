"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { StageEngine, type Display, type TStep } from "@/lib/stage-engine";

export interface StageHandle {
  show: (d: Display, crossfade?: boolean) => Promise<void>;
  tap: (url: string) => Promise<void>;
  transition: (steps: TStep[], target: Display, blurPx: number, onProgress?: (p: number) => void) => Promise<void>;
  busy: () => boolean;
}

/**
 * The media of one avatar view: a picture, an idle video, two clip "decks" and a freeze canvas — always the same
 * five elements, reused for every outfit, tap and transition (see lib/stage-engine.ts).
 * `initialPoster` is rendered on the server so the picture is there before any script runs.
 */
const Stage = forwardRef<StageHandle, { initialPoster: string; alt?: string; className?: string }>(function Stage({ initialPoster, alt = "", className }, handle) {
  const poster = useRef<HTMLImageElement>(null);
  const idle = useRef<HTMLVideoElement>(null);
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);
  const freeze = useRef<HTMLCanvasElement>(null);
  const engine = useRef<StageEngine | null>(null);

  useEffect(() => {
    const e = new StageEngine({ poster: poster.current!, idle: idle.current!, decks: [a.current!, b.current!], freeze: freeze.current! });
    engine.current = e;
    return () => {
      e.dispose();
      engine.current = null;
    };
  }, []);

  useImperativeHandle(handle, () => ({
    show: (d, crossfade) => engine.current?.show(d, crossfade) ?? Promise.resolve(),
    tap: (url) => engine.current?.tap(url) ?? Promise.resolve(),
    transition: (steps, target, blurPx, onProgress) => engine.current?.transition(steps, target, blurPx, onProgress) ?? Promise.resolve(),
    busy: () => !!engine.current?.busy,
  }));

  return (
    <div className={`stage-media ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={poster} className="stage-el" src={initialPoster} alt={alt} draggable={false} />
      <video ref={idle} className="stage-el" muted playsInline preload="auto" aria-hidden />
      <video ref={a} className="stage-el" muted playsInline preload="auto" aria-hidden />
      <video ref={b} className="stage-el" muted playsInline preload="auto" aria-hidden />
      <canvas ref={freeze} className="stage-el" aria-hidden />
    </div>
  );
});

export default Stage;
