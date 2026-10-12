"use client";

// Everything that touches Clerk lives here, so the rest of the app never imports it.
// These components must only be rendered when Clerk is configured (AUTH_ENABLED).
import { SignInButton, UserButton, useAuth, useClerk } from "@clerk/nextjs";
import { useEffect } from "react";

/** Tells the app whenever the signed-in state changes. */
export function ClerkWatcher({ onChange }: { onChange: (signedIn: boolean) => void }) {
  const { isLoaded, isSignedIn } = useAuth();
  useEffect(() => {
    if (isLoaded) onChange(!!isSignedIn);
  }, [isLoaded, isSignedIn, onChange]);
  return null;
}

/** Renders `children` as the sign-in trigger once Clerk has loaded; until then (or if it never loads) a disabled stand-in. */
export function ClerkSignIn({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const { loaded } = useClerk();
  return loaded ? <SignInButton mode="modal">{children}</SignInButton> : <>{fallback}</>;
}

export function ClerkAccount() {
  return <UserButton />;
}
