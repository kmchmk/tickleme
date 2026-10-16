"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getClip } from "@/lib/videoCache";
import type { AvatarBundle, TransitionSet } from "@/lib/types";

interface File {
  key: string;
  url: string;
  version: number;
}

/** Every file the viewer may need on this avatar page: all open outfits (idle + tap clips) and all transition clips. */
export function bundleFiles(bundle: AvatarBundle): File[] {
  const files = new Map<string, File>();
  for (const v of Object.values(bundle.variants)) {
    if (v.status !== "open") continue;
    const m = v.manifest;
    files.set(m.idle.key, { ...m.idle, version: m.version });
    for (const a of m.actions) if (a.url) files.set(a.key, { key: a.key, url: a.url, version: m.version });
  }
  for (const t of Object.values(bundle.transitions) as TransitionSet[]) for (const c of [...t.up, ...t.down]) files.set(c.key, { ...c, version: t.version });
  return [...files.values()];
}

/** A bundle together with an in-memory (blob) URL for every one of its files. */
export interface Snapshot {
  bundle: AvatarBundle;
  urls: Record<string, string>;
}

/**
 * Downloads (or reads from the IndexedDB cache) every file up front and hands back blob URLs by stable key, so
 * nothing after this waits on the network. When the bundle changes (sign-in, purchase, admin grant) the previous
 * snapshot stays usable until the new one is complete; files both share are reused, not fetched again.
 */
export function usePreload(bundle: AvatarBundle | null) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const cache = useRef(new Map<string, { url: string; version: number }>());

  useEffect(() => {
    if (!bundle) return;
    let cancelled = false;
    const files = bundleFiles(bundle);
    const todo = files.filter((f) => cache.current.get(f.key)?.version !== f.version);
    let next = 0;
    let done = 0;
    setLoading(true);
    setFailed(false);
    setProgress(todo.length ? 0 : 1);
    const worker = async () => {
      while (!cancelled && next < todo.length) {
        const f = todo[next++];
        const blob = await getClip(f.key, f.url, f.version);
        if (cancelled) return;
        const old = cache.current.get(f.key);
        cache.current.set(f.key, { url: URL.createObjectURL(blob), version: f.version });
        if (old) setTimeout(() => URL.revokeObjectURL(old.url), 10_000); // an element may still be showing it
        setProgress(++done / todo.length);
      }
    };
    Promise.all(Array.from({ length: 6 }, worker))
      .then(() => {
        if (cancelled) return;
        const keep = new Set(files.map((f) => f.key));
        const urls: Record<string, string> = {};
        for (const [k, v] of cache.current) {
          if (keep.has(k)) urls[k] = v.url;
          else {
            cache.current.delete(k);
            const u = v.url;
            setTimeout(() => URL.revokeObjectURL(u), 10_000); // let the stage move off it first
          }
        }
        setSnapshot({ bundle, urls });
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bundle, attempt]);

  // Free everything when the page goes away.
  useEffect(() => {
    const c = cache.current;
    return () => {
      for (const v of c.values()) URL.revokeObjectURL(v.url);
      c.clear();
    };
  }, []);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { snapshot, loading, progress, failed, retry };
}
