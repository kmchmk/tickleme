import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AvatarScreen from "@/components/AvatarScreen";
import { getAvatar, getAvatars } from "@/lib/avatars";

export const dynamicParams = false;
export const generateStaticParams = () => getAvatars().map((a) => ({ id: a.id }));

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ debug?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const avatar = getAvatar((await params).id);
  return avatar ? { title: `${avatar.name} · Tickle Me` } : {};
}

export default async function AvatarPage({ params, searchParams }: Params) {
  const { id } = await params;
  const { debug } = await searchParams;
  const avatar = getAvatar(id);
  if (!avatar) notFound();
  // TODO(paywall): gate avatar.premium here (auth/payment check) before rendering.
  return <AvatarScreen avatar={avatar} debug={debug === "1"} />;
}
