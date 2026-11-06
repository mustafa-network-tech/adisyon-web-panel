import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy without nonces (the "Without Nonces" setup of the Next.js CSP guide): nonces would
 * force every page, including the statically rendered marketing pages, to render dynamically. Inline scripts
 * and styles that Next.js itself emits therefore stay allowed, but everything else is closed down: only this
 * site and the project's own Supabase address (REST, Auth, Realtime websocket) may be contacted, no plugins,
 * no foreign base URL, forms only post to this site, and the page cannot be framed.
 */
function supabaseSources() {
  try {
    const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return `${origin.origin} wss://${origin.host}`;
  } catch {
    return "https://*.supabase.co wss://*.supabase.co"; // build without the variable: any Supabase project
  }
}

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", // data: = the generated QR codes
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseSources()}`,
  "worker-src 'self'", // the service worker
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        // Private areas and the auth callback also say noindex in the HTTP header.
        source: "/:area(app|mk-admin|auth|davet|qr|offline)/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
