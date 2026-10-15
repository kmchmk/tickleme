import type { Metadata } from "next";
import { redirect } from "next/navigation";
import JoinForm from "@/components/JoinForm";
import { AUTH_ENABLED } from "@/lib/config";

export const metadata: Metadata = { title: "Join · Tickle Me", robots: { index: false } };

/** Where invitation emails (sent from the admin dashboard) land: Clerk's sign-up form picks up the invitation ticket. */
export default function JoinPage() {
  if (!AUTH_ENABLED) redirect("/");
  return (
    <main className="join">
      <JoinForm />
    </main>
  );
}
