import type { Metadata, Viewport } from "next";
import "@fontsource-variable/literata";
import "@fontsource-variable/instrument-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Bookmarker", template: "%s | Bookmarker" },
  description:
    "Keep your place in every book. Save your page with a photo, or describe the last thing you remember and find it again.",
};

export const viewport: Viewport = {
  themeColor: "#eef1ea",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
