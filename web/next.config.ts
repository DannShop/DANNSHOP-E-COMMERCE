import type { NextConfig } from "next";

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // blob: wajib ada - dialog crop upload gambar (ImageUploadField, dipakai
  // banner/produk/logo) menampilkan preview lewat URL.createObjectURL(file)
  // SEBELUM file diunggah ke Blob storage, jadi src-nya sempat berbentuk
  // blob: dulu. Tanpa ini browser diam-diam MEMBLOKIR gambar itu (tidak ada
  // error di UI, cuma kotak crop kosong) - persis gejala "pilih file tapi
  // gambar tidak muncul untuk di-crop".
  "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com",
  "font-src 'self'",
  "connect-src 'self'",
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
