import type { MetadataRoute } from "next";

// "IMRFC" is only used here as the OS-level home-screen label (install prompt, app
// switcher) — the in-app UI itself never shows a name, per the design brief.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IMRFC",
    short_name: "IMRFC",
    description: "Events and equipment tracking for Imperial Medicals RFC",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f4f0",
    theme_color: "#f5f4f0",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
