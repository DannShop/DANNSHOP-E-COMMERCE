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
  experimental: {
    serverActions: {
      // Default Next.js untuk body Server Action cuma 1MB - berlaku di level
      // framework, SEBELUM kode action manapun sempat jalan (try/catch di
      // lib/blob-upload.ts tidak pernah kebagian giliran menangani ini,
      // makanya yang muncul cuma "server error" generik tanpa pesan jelas).
      // Video logo situs (lib/blob-upload.ts, MAX_VIDEO_UPLOAD_BYTES) boleh
      // sampai 20MB - limit di sini dinaikkan melewati itu, dengan sedikit
      // ruang ekstra untuk overhead multipart/form-data (boundary, header
      // tiap field), bukan cuma pas 20MB.
      bodySizeLimit: "25mb",
    },
  },
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
