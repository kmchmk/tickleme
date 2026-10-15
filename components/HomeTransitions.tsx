"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getClip } from "@/lib/videoCache";
import type { AvatarBundle } from "@/lib/types";
import { useViewer } from "./viewer";

type PerAvatar = Record<string, AvatarBundle["transitions"]>;
interface Ctx {
  transitions: PerAvatar;
  /** Blob URLs by stable key; fills in shortly after the page is up. */
  urls: Record<string, string>;
}
const HomeCtx = createContext<Ctx>({ transitions: {}, urls: {} });
export const useHomeTransitions = () => useContext(HomeCtx);

/**
 * The home page shows pictures; when the outfit chips are pressed the transition clips play in the card.
 * All the clips this viewer may play are fetched right after the page is up (and cached), so a press never waits;
 * if one is pressed in the first moments before they arrive, the picture simply swaps.
 */
export function HomeTransitionsProvider({ children }: { children: React.ReactNode }) {
  const { viewer } = useViewer();
  const [transitions, setTransitions] = useState<PerAvatar>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const viewerKey = useMemo(() => (viewer ? JSON.stringify(viewer) : ""), [viewer]);

  useEffect(() => {
    if (!viewer) return;
    let cancelled = false;
    const created: string[] = [];
    (async () => {
      const res = await fetch("/api/transitions", { cache: "no-store" }).catch(() => null);
      if (!res?.ok || cancelled) return;
      const data = (await res.json()) as PerAvatar;
      if (cancelled) return;
      setTransitions(data);
      await new Promise((r) => setTimeout(r, 600)); // let the page paint first
      const files = Object.values(data).flatMap((t) => Object.values(t).flatMap((s) => [...s.up, ...s.down].map((c) => ({ ...c, version: s.version }))));
      let next = 0;
      const worker = async () => {
        while (!cancelled && next < files.length) {
          const f = files[next++];
          try {
            const u = URL.createObjectURL(await getClip(f.key, f.url, f.version));
            created.push(u);
            if (!cancelled) setUrls((m) => ({ ...m, [f.key]: u }));
          } catch {
            /* that clip just won't play; the picture swaps instead */
          }
        }
      };
      await Promise.all(Array.from({ length: 4 }, worker));
    })();
    return () => {
      cancelled = true;
      created.forEach(URL.revokeObjectURL);
      setUrls({});
    };
    // viewerKey stands in for `viewer`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerKey]);

  const value = useMemo(() => ({ transitions, urls }), [transitions, urls]);
  return <HomeCtx.Provider value={value}>{children}</HomeCtx.Provider>;
}
