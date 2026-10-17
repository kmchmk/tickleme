import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { AUTH_ENABLED } from "@/lib/config";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

/** Clerk's sign-in on our own domain (its links point here instead of the hosted accounts page). */
export default function SignInPage() {
  if (!AUTH_ENABLED) redirect("/");
  return (
    <main className="join">
      <SignIn withSignUp fallbackRedirectUrl="/" />
    </main>
  );
}
