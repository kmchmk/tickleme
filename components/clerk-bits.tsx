"use client";

// Everything that touches Clerk lives here, so the rest of the app never imports it.
// These components must only be rendered when Clerk is configured (AUTH_ENABLED).
import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { useEffect } from "react";

/** Tells the app whenever the signed-in state changes. */
export function ClerkWatcher({ onChange }: { onChange: (signedIn: boolean) => void }) {
  const { isLoaded, isSignedIn } = useAuth();
  useEffect(() => {
    if (isLoaded) onChange(!!isSignedIn);
  }, [isLoaded, isSignedIn, onChange]);
  return null;
}

export function ClerkSignIn({ children }: { children: React.ReactNode }) {
  return <SignInButton mode="modal">{children}</SignInButton>;
}

export function ClerkAccount() {
  return <UserButton />;
}
