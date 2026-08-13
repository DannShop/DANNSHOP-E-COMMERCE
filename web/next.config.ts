import type { NextConfig } from "next";

// Host Midtrans yang dipakai mode Snap. Snap.js dimuat dari app.midtrans.com
// (production) / app.sandbox.midtrans.com (sandbox), lalu skrip itu MEMBUKA
// IFRAME ke host yang sama - jadi script-src saja tidak cukup, frame-src
// wajib ikut. Tanpa frame-src, gejalanya persis jebakan CSP yang sudah pernah
// memakan korban di repo ini: tidak ada error di UI, popup-nya cuma tidak
// pernah muncul. connect-src untuk XHR status yang ditembak Snap sendiri.
//
// Hanya berefek saat Metode Integrasi = Snap; di mode Core API tidak ada satu
// pun request ke host ini. Dibiarkan permanen supaya memindahkan toggle di
// panel admin tidak pernah menuntut deploy ulang - itu inti dari toggle-nya.
const MIDTRANS_SNAP_HOSTS = "https://app.midtrans.com https://app.sandbox.midtrans.com";
// Snap.js menembak sebagian endpoint ke host api.* (bukan app.*) saat memproses
// pembayaran. Dipisah dari daftar di atas karena host ini HANYA perlu di
// connect-src - tidak ada skrip maupun iframe yang dimuat dari sini.
const MIDTRANS_API_HOSTS = "https://api.midtrans.com https://api.sandbox.midtrans.com";

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${MIDTRANS_SNAP_HOSTS}`,
  `frame-src 'self' ${MIDTRANS_SNAP_HOSTS}`,
  "style-src 'self' 'unsafe-inline'",
  // blob: wajib ada - dialog crop upload gambar (ImageUploadField, dipakai
  // banner/produk/logo) menampilkan preview lewat URL.createObjectURL(file)
  // SEBELUM file diunggah ke Blob storage, jadi src-nya sempat berbentuk
  // blob: dulu. Tanpa ini browser diam-diam MEMBLOKIR gambar itu (tidak ada
  // error di UI, cuma kotak crop kosong) - persis gejala "pilih file tapi
  // gambar tidak muncul untuk di-crop".
  `img-src 'self' data: blob: https://*.public.blob.vercel-storage.com ${MIDTRANS_SNAP_HOSTS}`,
  "font-src 'self'",
  `connect-src 'self' ${MIDTRANS_SNAP_HOSTS} ${MIDTRANS_API_HOSTS}`,
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Halaman /mitra/dokumentasi membaca src/content/api-partner.md dari disk saat
  // request. File yang cuma dirujuk lewat path string tidak terlihat oleh
  // penelusuran dependensi Next.js, jadi tanpa baris ini file-nya TIDAK ikut
  // terbawa ke bundle serverless - halaman mulus di lokal lalu 500 di produksi,
  // kelas kegagalan senyap yang sudah beberapa kali menggigit repo ini.
  outputFileTracingIncludes: {
    "/mitra/dokumentasi": ["src/content/**"],
  },
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
