/**
 * Plays an avatar with a SMALL, FIXED set of media elements that is reused for everything:
 *
 *   poster  <img>    the outfit's still picture (always underneath; the only thing shown for a locked outfit)
 *   idle    <video>  the outfit's idle loop
 *   decks   <video>×2 tap clips and transition clips, alternating so one can start while the other holds a frame
 *   freeze  <canvas> a frozen copy of whatever was showing, used to cross-fade from it
 *
 * Elements are never created or destroyed while the page is open; only their sources change. (Creating a set of
 * <video> elements per outfit made phones run out of media players after a few outfit switches, and then clips
 * silently failed to start.) All sources are blob URLs that are already in memory, so nothing here waits on the
 * network, and every wait has a time limit so a stuck video can never freeze the page.
 */

export interface StageEls {
  poster: HTMLImageElement;
  idle: HTMLVideoElement;
  decks: [HTMLVideoElement, HTMLVideoElement];
  freeze: HTMLCanvasElement;
}

/** What an outfit looks like at rest: its picture, and its idle loop when the viewer may play it. */
export interface Display {
  poster: string;
  idle?: string | null;
}

export interface TStep {
  url: string;
  /** Gradually blur ("in") or un-blur ("out") across the ramping steps (bikini <-> blurred explicit). */
  ramp?: "in" | "out";
}

const FADE_TAP = 140; // frozen frame -> tapped clip
const FADE_START = 180; // frozen frame -> first transition clip
const FADE_JOIN = 120; // one transition clip -> the next
const FADE_END = 220; // last transition clip -> the new outfit
const CLIP_GUESS = 2.56; // seconds, until a clip reports its own duration

type Top = "poster" | "idle" | 0 | 1;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const finite = (n: number, fallback: number) => (Number.isFinite(n) && n > 0 ? n : fallback);

function prep(v: HTMLVideoElement) {
  v.muted = true;
  v.defaultMuted = true;
  v.playsInline = true;
  v.setAttribute("muted", "");
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");
  v.preload = "auto";
}

function fade(el: HTMLElement, to: number, ms: number) {
  el.style.transition = ms ? `opacity ${ms}ms linear` : "none";
  if (!ms) void el.offsetWidth;
  el.style.opacity = String(to);
}

/** Resolves once a new frame of `v` is actually on screen (or shortly after, where that can't be observed). */
function presented(v: HTMLVideoElement): Promise<void> {
  const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback;
  if (rvfc) return Promise.race([new Promise<void>((r) => rvfc.call(v, () => r())), wait(250)]);
  return wait(60);
}

export class StageEngine {
  private run = 0; // bumped by every tap / transition / show; older runs stop touching the stage
  private top: Top = "poster";
  private display: Display | null = null;
  private nextDeck: 0 | 1 = 0;
  private disposed = false;
  busy = false; // a transition is running (taps are ignored meanwhile)

  constructor(private els: StageEls) {
    [els.idle, ...els.decks].forEach((v) => {
      prep(v);
      v.style.opacity = "0";
    });
    els.idle.loop = true;
    els.idle.style.zIndex = "2";
    els.poster.style.zIndex = "1";
    els.freeze.style.zIndex = "8";
    els.freeze.style.opacity = "0";
    document.addEventListener("visibilitychange", this.onVisible);
  }

  dispose() {
    this.disposed = true;
    this.run++;
    document.removeEventListener("visibilitychange", this.onVisible);
    for (const v of [this.els.idle, ...this.els.decks]) {
      v.pause();
      v.removeAttribute("src"); // frees the media player right away instead of at garbage collection
      v.load();
    }
  }

  /** Coming back to the tab: phones pause videos in the background. */
  private onVisible = () => {
    if (document.hidden || this.disposed) return;
    const v = this.top === "idle" ? this.els.idle : typeof this.top === "number" ? this.els.decks[this.top] : null;
    if (v && v.paused && !v.ended) void v.play().catch(() => {});
  };

  private el(t: Top): HTMLImageElement | HTMLVideoElement {
    return t === "poster" ? this.els.poster : t === "idle" ? this.els.idle : this.els.decks[t];
  }

  /** Copies whatever is on top onto the canvas and shows the canvas above everything, instantly. */
  private freeze() {
    const c = this.els.freeze;
    let src: HTMLImageElement | HTMLVideoElement = this.el(this.top);
    if (src instanceof HTMLVideoElement && !src.videoWidth) src = this.els.poster;
    const w = src instanceof HTMLVideoElement ? src.videoWidth : src.naturalWidth;
    const h = src instanceof HTMLVideoElement ? src.videoHeight : src.naturalHeight;
    if (!w || !h) return; // nothing to freeze yet (very first paint)
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    try {
      c.getContext("2d")?.drawImage(src, 0, 0, w, h);
    } catch {
      return;
    }
    fade(c, 1, 0);
  }

  /** Points `v` at `url` and starts it from the beginning. False if it could not start in time. */
  private async start(v: HTMLVideoElement, url: string, loop = false): Promise<boolean> {
    v.loop = loop;
    if (v.getAttribute("src") !== url) v.src = url;
    try {
      v.currentTime = 0;
    } catch {
      /* not seekable yet: it starts at 0 anyway */
    }
    const ok = await Promise.race([v.play().then(() => true, () => false), wait(4000).then(() => false)]);
    if (!ok) return false;
    await presented(v);
    return true;
  }

  /** Loads `url` into `v` and parks it on its first frame (decoders warmed, also on iPhones that ignore preload). */
  private async park(v: HTMLVideoElement, url: string): Promise<boolean> {
    const ok = await this.start(v, url, true);
    v.pause();
    try {
      v.currentTime = 0;
    } catch {}
    return ok;
  }

  /** Resolves when `v` has played to its end; never hangs (a stall resumes it, and a watchdog gives up). */
  private ended(v: HTMLVideoElement, gen: number): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        v.removeEventListener("ended", finish);
        clearInterval(poll);
        clearTimeout(dog);
        resolve();
      };
      v.addEventListener("ended", finish);
      const poll = setInterval(() => {
        if (this.disposed || gen !== this.run) return finish();
        const d = v.duration;
        if (v.ended || (Number.isFinite(d) && d > 0 && v.currentTime >= d - 0.05)) return finish();
        if (v.paused && !document.hidden) void v.play().catch(() => {});
      }, 120);
      const dog = setTimeout(finish, (finite(v.duration, 3) + 4) * 1000);
    });
  }

  private hideDecks(except?: HTMLVideoElement) {
    for (const d of this.els.decks) {
      if (d === except) continue;
      d.pause();
      fade(d, 0, 0);
      d.style.filter = "";
    }
  }

  private async setPoster(url: string) {
    const p = this.els.poster;
    if (p.getAttribute("src") !== url) p.src = url;
    if (!p.complete) await Promise.race([p.decode().catch(() => {}), wait(1500)]);
  }

  /** Shows an outfit at rest (first load, or after it was unlocked / locked), cross-fading from what was there. */
  async show(d: Display, crossfade = true) {
    const gen = ++this.run;
    this.busy = false; // supersedes any transition
    if (crossfade) this.freeze();
    this.display = d;
    this.hideDecks();
    await this.setPoster(d.poster);
    let playing = false;
    if (d.idle) playing = await this.start(this.els.idle, d.idle, true);
    else this.els.idle.pause();
    if (gen !== this.run) return;
    fade(this.els.idle, playing ? 1 : 0, 0);
    this.top = playing ? "idle" : "poster";
    fade(this.els.freeze, 0, crossfade ? FADE_START : 0);
  }

  /** Plays a tap clip, then returns to the idle loop. Instant: the current frame freezes while the clip starts. */
  async tap(url: string) {
    if (this.busy || !this.display?.idle) return;
    const gen = ++this.run;
    this.freeze();
    const i = this.nextDeck;
    this.nextDeck = (1 - i) as 0 | 1;
    const deck = this.els.decks[i];
    deck.style.zIndex = "4";
    this.els.decks[1 - i].style.zIndex = "3";
    const ok = await this.start(deck, url);
    if (gen !== this.run) return;
    if (!ok) return fade(this.els.freeze, 0, FADE_TAP);
    fade(deck, 1, 0);
    this.hideDecks(deck);
    this.els.idle.pause();
    this.top = i;
    fade(this.els.freeze, 0, FADE_TAP);

    await this.ended(deck, gen);
    if (gen !== this.run) return;
    // The clip's last frame is the idle's first frame: restart idle underneath, then uncover it.
    const idle = this.els.idle;
    try {
      idle.currentTime = 0;
    } catch {}
    await Promise.race([idle.play().catch(() => {}), wait(1500)]);
    await presented(idle);
    if (gen !== this.run) return;
    fade(idle, 1, 0);
    fade(deck, 0, 0);
    deck.pause();
    this.top = "idle";
  }

  /**
   * Plays transition clips in order and lands on `target`. The target's idle is loaded while the clips play, so
   * the hand-over is instant. `onProgress` gets 0..1 for a progress indicator.
   */
  async transition(steps: TStep[], target: Display, blurPx: number, onProgress?: (p: number) => void) {
    this.busy = true;
    const gen = ++this.run;
    const report = (p: number) => onProgress?.(Math.max(0, Math.min(1, p)));
    try {
      report(0);
      this.freeze();
      // Underneath everything from now on: the new outfit's picture (and its idle, parked on frame 0, hidden).
      this.hideDecks();
      this.els.idle.pause();
      fade(this.els.idle, 0, 0);
      await this.setPoster(target.poster);
      const idleReady = target.idle ? this.park(this.els.idle, target.idle) : Promise.resolve(false);

      const durations = steps.map(() => CLIP_GUESS);
      const total = () => durations.reduce((a, b) => a + b, 0) || 1;
      const ramping = steps.map((s, i) => (s.ramp ? i : -1)).filter((i) => i >= 0);
      const blurAt = (i: number, t: number) => {
        if (!ramping.length) return 0;
        const span = ramping.reduce((a, j) => a + durations[j], 0);
        let done = 0;
        for (const j of ramping) done += j < i ? durations[j] : j === i ? Math.min(t, durations[j]) : 0;
        const p = Math.min(1, done / span);
        return (steps[ramping[0]].ramp === "in" ? p : 1 - p) * blurPx;
      };

      let prev: HTMLVideoElement | null = null;
      let raf = 0;
      for (let i = 0; i < steps.length; i++) {
        const idx = this.nextDeck;
        this.nextDeck = (1 - idx) as 0 | 1;
        const deck = this.els.decks[idx];
        deck.style.zIndex = String(4 + i);
        const b = blurAt(i, 0);
        deck.style.filter = b > 0.2 ? `blur(${b.toFixed(1)}px)` : "";
        fade(deck, 0, 0);
        const ok = await this.start(deck, steps[i].url);
        if (gen !== this.run) return;
        if (!ok) continue; // a clip that cannot play is skipped; the rest still runs
        durations[i] = finite(deck.duration, CLIP_GUESS);
        fade(deck, 1, i === 0 || !prev ? 0 : FADE_JOIN);
        if (!prev) fade(this.els.freeze, 0, FADE_START);
        const old = prev;
        if (old) setTimeout(() => old !== deck && old.pause(), FADE_JOIN + 40); // the previous clip is covered by now
        this.top = idx;
        const before = durations.slice(0, i).reduce((a, x) => a + x, 0);
        cancelAnimationFrame(raf);
        const tick = () => {
          if (gen !== this.run) return;
          const t = deck.currentTime;
          report((before + t) / total());
          const bb = blurAt(i, t);
          deck.style.filter = bb > 0.2 ? `blur(${bb.toFixed(1)}px)` : "";
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        await this.ended(deck, gen);
        cancelAnimationFrame(raf);
        if (gen !== this.run) return;
        prev = deck;
      }

      // Arrive: the new outfit is underneath; fade the last clip (or the frozen frame) away onto it.
      const playing = await idleReady;
      if (gen !== this.run) return;
      if (playing) {
        const idle = this.els.idle;
        try {
          idle.currentTime = 0;
        } catch {}
        await Promise.race([idle.play().catch(() => {}), wait(1500)]);
        await presented(idle);
        fade(idle, 1, 0);
      }
      if (gen !== this.run) return;
      if (prev) fade(prev, 0, FADE_END);
      fade(this.els.freeze, 0, prev ? 0 : FADE_END);
      await wait(FADE_END + 30);
      if (gen !== this.run) return;
      this.hideDecks();
      this.display = target;
      this.top = playing ? "idle" : "poster";
    } finally {
      if (gen === this.run) this.busy = false; // (a newer run owns `busy` otherwise)
      report(1);
    }
  }
}
