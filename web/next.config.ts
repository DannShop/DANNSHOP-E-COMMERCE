import type { NextConfig } from "next";

const MIDTRANS_SNAP_DOMAINS = "https://app.sandbox.midtrans.com https://app.midtrans.com";

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${MIDTRANS_SNAP_DOMAINS}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.public.blob.vercel-storage.com",
  "font-src 'self'",
  `connect-src 'self' ${MIDTRANS_SNAP_DOMAINS}`,
  `frame-src ${MIDTRANS_SNAP_DOMAINS}`,
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
    ];
  },
};

export default nextConfig;
