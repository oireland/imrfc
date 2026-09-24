import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Image from "next/image";
import crest from "../../docs/brand/crest.png";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IMRFC Club Hub",
  description: "Events and kit tracking for Imperial Medicals RFC",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1f2f55" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1729" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-GB"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="flex items-center gap-3 bg-primary px-4 py-3 text-primary-foreground dark:bg-card dark:text-card-foreground">
          <div className="rounded-lg bg-tile p-1">
            <Image src={crest} alt="IMRFC crest" className="size-9" priority />
          </div>
          <h1 className="font-heading text-lg font-semibold">IMRFC Club Hub</h1>
        </header>
        <main className="flex-1 px-4 py-6">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
