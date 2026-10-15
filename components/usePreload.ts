"use client";

import { useCallback, useEffect, useState } from "react";
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

/**
 * Downloads (or reads from the IndexedDB cache) every file up front and hands back blob URLs by stable key.
 * Nothing after this waits on the network, which is what makes outfit switches instant.
 */
export function usePreload(bundle: AvatarBundle | null) {
  const [state, setState] = useState<{ urls: Record<string, string> | null; progress: number; failed: boolean }>({ urls: null, progress: 0, failed: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!bundle) return;
    let cancelled = false;
    const created: string[] = [];
    const files = bundleFiles(bundle);
    const out: Record<string, string> = {};
    let next = 0;
    let done = 0;
    setState({ urls: null, progress: 0, failed: false });
    const worker = async () => {
      while (!cancelled && next < files.length) {
        const f = files[next++];
        const blob = await getClip(f.key, f.url, f.version);
        const u = URL.createObjectURL(blob);
        created.push(u);
        out[f.key] = u;
        if (!cancelled) setState((s) => ({ ...s, progress: ++done / files.length }));
      }
    };
    Promise.all(Array.from({ length: 6 }, worker))
      .then(() => !cancelled && setState({ urls: out, progress: 1, failed: false }))
      .catch(() => !cancelled && setState({ urls: null, progress: 0, failed: true }));
    return () => {
      cancelled = true;
      created.forEach(URL.revokeObjectURL);
    };
  }, [bundle, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...state, retry };
}
