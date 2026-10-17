import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ViewerProvider } from "@/components/viewer";
import { AUTH_ENABLED } from "@/lib/config-public";
import { DESCRIPTION, SITE_NAME, SITE_URL, TAGLINE } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME}: ${TAGLINE}`, template: `%s · ${SITE_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ["interactive avatar", "tap game", "tickle", "touch reactions", "interactive video", "Solana"],
  alternates: { canonical: "/" },
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  openGraph: { type: "website", siteName: SITE_NAME, title: `${SITE_NAME}: ${TAGLINE}`, description: DESCRIPTION, url: "/", locale: "en_US" },
  twitter: { card: "summary_large_image", title: `${SITE_NAME}: ${TAGLINE}`, description: DESCRIPTION },
  robots: { index: true, follow: true },
  // Some outfits are adult-only (behind sign-in + 18+ confirmation); say so, as search engines ask.
  other: { rating: "adult" },
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } } : {}),
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
  // Its links stay on this site (not Clerk's hosted accounts pages).
  return AUTH_ENABLED ? (
    <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up" signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/" afterSignOutUrl="/">
      {body}
    </ClerkProvider>
  ) : (
    body
  );
}
