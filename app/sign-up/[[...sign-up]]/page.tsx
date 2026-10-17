import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { AUTH_ENABLED } from "@/lib/config";

export const metadata: Metadata = { title: "Sign up", robots: { index: false } };

export default function SignUpPage() {
  if (!AUTH_ENABLED) redirect("/");
  return (
    <main className="join">
      <SignUp fallbackRedirectUrl="/" />
    </main>
  );
}
