import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Greater Cairo Atlas",
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
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
