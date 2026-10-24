import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AvatarScreen from "@/components/AvatarScreen";
import { isVariantKey } from "@/lib/access";
import { getAvatar, posterUrl, summarize } from "@/lib/avatars";
import { profileOf } from "@/lib/profiles";
import { SITE_NAME } from "@/lib/site";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string; debug?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const avatar = getAvatar((await params).id);
  if (!avatar) return { title: "Not found", robots: { index: false } };
  const v = avatar.variants.jeans;
  const spots = v.actions.length;
  const profile = profileOf(avatar.id);
  const description = `${profile?.tagline ? `${profile.tagline}. ` : ""}Play with ${avatar.name} on ${SITE_NAME}: ${spots} touch spots, each with its own reaction. Free to play, best on your phone.`;
  const image = posterUrl(v);
  return {
    title: `${avatar.name}: ${profile?.tagline ?? "an interactive avatar"}`,
    description,
    alternates: { canonical: `/a/${avatar.id}` }, // ?v=… outfit links are the same page
    openGraph: { type: "website", title: `${avatar.name} · ${SITE_NAME}`, description, url: `/a/${avatar.id}`, ...(/^https?:/.test(image) ? { images: [{ url: image, alt: `${avatar.name}, an interactive tickle avatar` }] } : {}) },
    twitter: { card: "summary_large_image", title: `${avatar.name} · ${SITE_NAME}`, description },
  };
}

export default async function AvatarPage({ params, searchParams }: Params) {
  const { id } = await params;
  const { v, debug } = await searchParams;
  const avatar = getAvatar(id);
  if (!avatar) notFound();
  return <AvatarScreen avatar={summarize(avatar)} initialVariant={v && isVariantKey(v) ? v : "jeans"} debug={debug === "1"} />;
}
