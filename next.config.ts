import type { NextConfig } from "next";

/**
 * Baseline security headers, sent on every response.
 *
 * - HSTS: browsers will only use HTTPS for this site (ignored on http://localhost).
 * - nosniff / frame-ancestors / X-Frame-Options: no content-type guessing, no framing (clickjacking).
 * - Referrer-Policy: do not leak full URLs to other sites.
 * - Permissions-Policy: switch off powerful browser features we do not use.
 * - CSP: only the directives that cannot break Next.js. A full script-src policy
 *   (with nonces) is deliberately left for later, when the client features exist.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=(self), payment=(), usb=()",
  },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
