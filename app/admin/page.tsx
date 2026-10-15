import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminDashboard from "@/components/AdminDashboard";
import { currentAdmin } from "@/lib/admin";
import { getAvatars } from "@/lib/avatars";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · Tickle Me", robots: { index: false, follow: false } };

/** Only emails listed in ALLOWED_ADMIN_EMAILS get this page; everyone else sees the ordinary "not found". */
export default async function AdminPage() {
  const admin = await currentAdmin();
  if (!admin) notFound();
  return <AdminDashboard email={admin.email} meId={admin.userId} avatars={getAvatars().map((a) => ({ id: a.id, name: a.name }))} />;
}
