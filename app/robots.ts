import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  // Only the production site is indexed; preview deployments stay out of search results.
  const production = !process.env.VERCEL_ENV || process.env.VERCEL_ENV === "production";
  return {
    rules: production ? { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/join", "/__clerk"] } : { userAgent: "*", disallow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
