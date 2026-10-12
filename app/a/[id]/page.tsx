import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AvatarScreen from "@/components/AvatarScreen";
import { isVariantKey } from "@/lib/access";
import { getAvatar, summarize } from "@/lib/avatars";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string; debug?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const avatar = getAvatar((await params).id);
  return avatar ? { title: `${avatar.name} · Tickle Me` } : {};
}

export default async function AvatarPage({ params, searchParams }: Params) {
  const { id } = await params;
  const { v, debug } = await searchParams;
  const avatar = getAvatar(id);
  if (!avatar) notFound();
  return <AvatarScreen avatar={summarize(avatar)} initialVariant={v && isVariantKey(v) ? v : "jeans"} debug={debug === "1"} />;
}
