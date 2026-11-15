import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Lexend, Newsreader } from "next/font/google";
import "./globals.css";
import { BOOT_SCRIPT } from "@/ui/a11y/prefs";
import { ServiceWorkerRegistration } from "@/ui/pwa/service-worker-registration";

/*
 * Three typefaces, all self-hosted by next/font (no request to Google from the browser):
 * Newsreader for headings, Atkinson Hyperlegible Next for the interface, Lexend for the
 * optional dyslexia-friendly body text.
 */
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-atkinson",
  display: "swap",
  // next has no built-in fallback metrics for this face; the system fallback is used as is.
  adjustFontFallback: false,
});

const lexend = Lexend({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-lexend",
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: { default: "FlowZone", template: "%s · FlowZone" },
  description: "A calm place for your tasks.",
  applicationName: "FlowZone",
  appleWebApp: { capable: true, title: "FlowZone", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#edf2ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1a1c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${atkinson.variable} ${lexend.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
