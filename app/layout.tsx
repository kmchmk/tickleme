import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tickle Me",
  description: "Interactive pets you can touch. Tap a nose, poke a belly, tickle an ear.",
  applicationName: "Tickle Me",
  appleWebApp: { capable: true, title: "Tickle Me", statusBarStyle: "black-translucent" },
  openGraph: {
    title: "Tickle Me",
    description: "Interactive pets you can touch.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#17121f",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
