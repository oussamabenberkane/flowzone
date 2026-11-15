import type { MetadataRoute } from "next";

/** The installable app. Served at /manifest.webmanifest. Icons live in public/icons. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FlowZone",
    short_name: "FlowZone",
    description: "A calm place for your tasks.",
    id: "/",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#edf2ee",
    theme_color: "#1f6266",
    lang: "en",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
