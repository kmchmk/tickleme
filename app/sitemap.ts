import type { MetadataRoute } from "next";
import { getAvatars } from "@/lib/avatars";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    ...getAvatars().map((a) => ({ url: `${SITE_URL}/a/${a.id}`, changeFrequency: "monthly" as const, priority: 0.8 })),
  ];
}
