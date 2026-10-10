import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tickle Me",
    short_name: "Tickle Me",
    description: "Interactive pets you can touch.",
    start_url: "/",
    display: "standalone",
    background_color: "#17121f",
    theme_color: "#17121f",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
