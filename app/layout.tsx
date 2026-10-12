import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ViewerProvider } from "@/components/viewer";
import { AUTH_ENABLED } from "@/lib/config-public";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tickle Me",
  description: "Interactive avatars you can touch. Tap a nose, poke a belly, tickle an ear.",
  applicationName: "Tickle Me",
  appleWebApp: { capable: true, title: "Tickle Me", statusBarStyle: "black-translucent" },
  openGraph: {
    title: "Tickle Me",
    description: "Interactive avatars you can touch.",
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
  const body = (
    <html lang="en">
      <body>
        <ViewerProvider>{children}</ViewerProvider>
      </body>
    </html>
  );
  // Clerk (email-link sign-in) wraps the app only when it is configured.
  return AUTH_ENABLED ? <ClerkProvider>{body}</ClerkProvider> : body;
}
