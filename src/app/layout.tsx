import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const ibmPlexArabic = localFont({
  src: [
    { path: "./fonts/ibm-plex-sans-arabic-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-sans-arabic-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-sans-arabic-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/ibm-plex-sans-arabic-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-ibm-plex-arabic",
  display: "swap",
  preload: false,
  fallback: ["Noto Sans Arabic", "Arial", "sans-serif"],
});

const ibmPlexLatin = localFont({
  src: [
    { path: "./fonts/ibm-plex-sans-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-sans-latin-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-sans-latin-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/ibm-plex-sans-latin-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-ibm-plex-latin",
  display: "swap",
  preload: false,
  fallback: ["Arial", "sans-serif"],
});

const ibmPlexMono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-ibm-plex-mono",
  display: "swap",
  preload: false,
  fallback: ["ui-monospace", "monospace"],
});

export const metadata: Metadata = {
  title: {
    default: "أطلس القاهرة الكبرى | Greater Cairo Atlas",
    template: "%s | Greater Cairo Atlas",
  },
  description:
    "A documented, source-backed interactive geospatial atlas of Greater Cairo, Egypt. Every fact retains provenance; conflicting claims coexist side by side; planned projects are never shown as operational.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
      className={`${ibmPlexArabic.variable} ${ibmPlexLatin.variable} ${ibmPlexMono.variable}`}
    >
      <body className="min-h-screen bg-background text-foreground">{children}</body>
    </html>
  );
}
