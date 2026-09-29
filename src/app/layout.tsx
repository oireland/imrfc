import type { Metadata, Viewport } from "next";
import { Geist_Mono, Instrument_Serif, Inter_Tight } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { PushRegistration } from "@/components/push-registration";
import { getCurrentUser } from "@/lib/session";
import "./globals.css";

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IMRFC",
  description: "Events and equipment tracking for Imperial Medicals RFC",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "IMRFC" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f4f0" },
    { media: "(prefers-color-scheme: dark)", color: "#11100f" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The crest menu's theme choice; "system" leaves it to prefers-color-scheme.
  const theme = (await getCurrentUser())?.theme ?? "system";

  return (
    <html
      lang="en-GB"
      data-theme={theme === "system" ? undefined : theme}
      className={`${interTight.variable} ${instrumentSerif.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <main className="flex-1 px-4 pt-10 pb-6">{children}</main>
        <Toaster theme={theme} />
        <PushRegistration />
      </body>
    </html>
  );
}
