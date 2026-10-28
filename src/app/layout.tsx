import type { Metadata, Viewport } from "next";
import "./globals.css";
import InstallPrompt from "@/components/InstallPrompt";
import BuildTag from "@/components/BuildTag";
import SwUpdater from "@/components/SwUpdater";
import LocaleHtml from "@/components/LocaleHtml";
import PastDueBanner from "@/components/PastDueBanner";
import CheckoutReturn from "@/components/CheckoutReturn";
import PushHeartbeat from "@/components/PushHeartbeat";
import PushRouter from "@/components/PushRouter";
import ThemeColor from "@/components/ThemeColor";

export const metadata: Metadata = {
  title: "Netai",
  description: "Your personal connector",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    // #5054 (28 Oct, Giorgi chose (b)): see-through on every page. iOS reads
    // this once at launch, for the whole app, so the strip behind the clock
    // is painted by the page itself (body::before in globals.css).
    statusBarStyle: "black-translucent",
    title: "Netai",
  },
};

export const viewport: Viewport = {
  themeColor: "#007F78",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ka" className="h-full">
      {/* 4921 (13 Oct, Giorgi): the design's face, Noto Sans Georgian 400 to
          700. It used to be an @import at the top of globals.css, which the
          production CSS build dropped, so every screen fell back to the
          system font. A stylesheet link in the head cannot be dropped. */}
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* The rule is about pages/_document; this is the App Router's root
            layout, which every page shares. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Georgian:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="h-full antialiased">
        <LocaleHtml />
        <ThemeColor />
        <PastDueBanner />
        <CheckoutReturn />
        <PushHeartbeat />
        <PushRouter />
        {children}
        <InstallPrompt />
        <BuildTag />
        <SwUpdater />
      </body>
    </html>
  );
}
