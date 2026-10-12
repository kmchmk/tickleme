"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AUTH_ENABLED } from "@/lib/config-public";
import { clearPrivateClips } from "@/lib/videoCache";
import type { Viewer } from "@/lib/types";
import { ClerkWatcher } from "./clerk-bits";

export interface Features {
  auth: boolean;
  payments: boolean;
  mockPayments: boolean;
}

interface ViewerState {
  /** null until the first answer arrives */
  viewer: Viewer | null;
  features: Features;
  refresh: () => Promise<void>;
}

const GUEST: Viewer = { signedIn: false, ageConfirmed: false, owned: [] };
const Ctx = createContext<ViewerState>({ viewer: null, features: { auth: false, payments: false, mockPayments: false }, refresh: async () => {} });

export const useViewer = () => useContext(Ctx);

export function ViewerProvider({ children }: { children: React.ReactNode }) {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [features, setFeatures] = useState<Features>({ auth: false, payments: false, mockPayments: false });
  const wasSignedIn = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const data = (await res.json()) as { viewer: Viewer; features: Features };
      setViewer(data.viewer);
      setFeatures(data.features);
      // Signing out on a shared device must not leave private clips behind.
      if (wasSignedIn.current && !data.viewer.signedIn) void clearPrivateClips();
      wasSignedIn.current = data.viewer.signedIn;
    } catch {
      setViewer((v) => v ?? GUEST);
    }
  }, []);

  // Always load once on mount: guest features (jeans) must never wait for the sign-in service.
  // With Clerk, the watcher below refreshes again whenever the signed-in state changes.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ viewer, features, refresh }), [viewer, features, refresh]);
  return (
    <Ctx.Provider value={value}>
      {AUTH_ENABLED && <ClerkWatcher onChange={() => void refresh()} />}
      {children}
    </Ctx.Provider>
  );
}
