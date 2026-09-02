import type { Metadata, Viewport } from "next";
import "./globals.css";
import InstallPrompt from "@/components/InstallPrompt";
import BuildTag from "@/components/BuildTag";
import LocaleHtml from "@/components/LocaleHtml";

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
    statusBarStyle: "default",
    title: "Netai",
  },
};

export const viewport: Viewport = {
  themeColor: "#2F6B4F",
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
      <body className="h-full antialiased">
        <LocaleHtml />
        {children}
        <InstallPrompt />
        <BuildTag />
      </body>
    </html>
  );
}
