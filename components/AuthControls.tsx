"use client";

import { AUTH_ENABLED } from "@/lib/config-public";
import { ClerkAccount, ClerkSignIn } from "./clerk-bits";
import { useViewer } from "./viewer";

/** A button that starts sign-in: Clerk's email-link modal, or a dev stand-in locally. */
export function SignInTrigger({ children, className = "btn" }: { children?: React.ReactNode; className?: string }) {
  const { features, refresh } = useViewer();
  const label = children ?? "Sign in";
  if (AUTH_ENABLED) {
    return (
      <ClerkSignIn>
        <button type="button" className={className}>
          {label}
        </button>
      </ClerkSignIn>
    );
  }
  if (features.auth) {
    // Development without Clerk: pick any name to be "signed in" as.
    return (
      <button
        type="button"
        className={className}
        onClick={async () => {
          const name = window.prompt("Dev sign-in as (any name):", "alice");
          if (name) {
            await fetch(`/api/dev/login?u=${encodeURIComponent(name)}`);
            await refresh();
          }
        }}
      >
        {label}
      </button>
    );
  }
  return (
    <button type="button" className={className} disabled title="Sign-in is not set up yet">
      Sign-in coming soon
    </button>
  );
}

/** Top-right account area: sign in, or the account menu. */
export function AccountArea() {
  const { viewer, features, refresh } = useViewer();
  if (viewer === null) return <span className="account-slot" aria-hidden />;
  if (!viewer.signedIn) return features.auth ? <SignInTrigger className="btn btn--small">Sign in</SignInTrigger> : null;
  if (AUTH_ENABLED) return <ClerkAccount />;
  return (
    <button
      type="button"
      className="btn btn--small btn--ghost"
      onClick={async () => {
        await fetch("/api/dev/login"); // no ?u= signs the dev user out
        await refresh();
      }}
    >
      Dev user · sign out
    </button>
  );
}
