import { cache } from "react";
import { db } from "@/lib/db";

export interface FaqItem {
  q: string;
  a: string;
}

export interface SiteSettings {
  logoUrl: string | null;
  logoType: "image" | "video";
  trendingMode: "manual" | "auto";
  faviconUrl: string | null;
  faqItems: FaqItem[];
  tosContent: string;
  privacyContent: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
}

// Default sebelum admin pernah menyimpan apa pun - konten asli yang dulu
// hardcode di masing-masing halaman, dipindah ke sini supaya halaman tidak
// pernah tampil kosong di deploy pertama sebelum admin sempat mengedit.
const DEFAULT_FAQ_ITEMS: FaqItem[] = [
  {
    q: "Berapa lama proses topup/pengiriman?",
    a: "Sebagian besar produk terkirim otomatis dalam hitungan detik sampai beberapa menit setelah pembayaran dikonfirmasi. Kalau ada gangguan dari provider, prosesnya bisa lebih lama — status pesanan bisa dipantau real-time di halaman invoice.",
  },
  {
    q: "Kenapa saldo/pesanan saya belum masuk padahal sudah bayar?",
    a: "Tunggu beberapa menit dulu — konfirmasi pembayaran kadang butuh waktu. Kalau setelah 15 menit masih belum berubah, hubungi CS lewat WhatsApp/Telegram di halaman Kontak dengan menyertakan nomor pesanan/bukti bayar.",
  },
  {
    q: "Bagaimana kalau pembayaran berhasil tapi barang gagal terkirim?",
    a: "Sistem otomatis mencoba ulang pengiriman. Kalau tetap gagal, dana akan dikembalikan sebagai saldo akun (untuk member) atau diproses refund manual oleh admin (untuk pembeli tanpa akun).",
  },
  {
    q: "Bagaimana cara mengecek status pesanan?",
    a: "Setiap pesanan punya link invoice unik yang dikirim setelah checkout — buka link itu untuk melihat status terkini. Member juga bisa melihat semua riwayat pesanan di halaman Akun Saya.",
  },
  {
    q: "Metode pembayaran apa saja yang tersedia?",
    a: "QRIS dan Virtual Account (BCA, BNI, BRI, CIMB Niaga, Permata) serta Mandiri Bill Payment. Semua metode diproses otomatis tanpa perlu konfirmasi manual ke admin.",
  },
  {
    q: "Apakah harus punya akun untuk berbelanja?",
    a: "Tidak wajib — checkout sebagai tamu (guest) tetap bisa dilakukan. Tapi dengan akun, kamu bisa isi saldo, bayar lebih cepat pakai saldo, dan melihat riwayat pesanan lengkap.",
  },
];

const DEFAULT_TOS_CONTENT = `Dengan menggunakan layanan DannShop, kamu dianggap telah membaca dan menyetujui syarat & ketentuan berikut.

## 1. Data Pesanan
Pastikan data yang dimasukkan saat checkout (User ID, Zone ID, nomor tujuan, dll.) sudah benar. DannShop tidak bertanggung jawab atas kesalahan input data yang menyebabkan produk terkirim ke akun/nomor yang salah.

## 2. Pembayaran
Pembayaran wajib dilakukan sesuai nominal yang tertera (termasuk kode unik, jika ada) sebelum batas waktu yang ditentukan. Pesanan yang tidak dibayar sampai batas waktu akan otomatis kedaluwarsa.

## 3. Pengiriman & Kegagalan Sistem
Produk dikirim otomatis oleh sistem setelah pembayaran terkonfirmasi. Jika terjadi kegagalan pengiriman di luar kendali kami (gangguan provider, dsb.), dana akan dikembalikan sebagai saldo akun atau diproses refund sesuai kebijakan yang berlaku.

## 4. Saldo Akun
Saldo yang sudah masuk ke akun tidak dapat ditarik tunai (non-refundable ke rekening bank) dan hanya dapat digunakan untuk transaksi di dalam platform DannShop.

## 5. Perubahan Ketentuan
DannShop berhak mengubah syarat & ketentuan ini sewaktu-waktu. Perubahan berlaku sejak dipublikasikan di halaman ini.`;

const DEFAULT_PRIVACY_CONTENT = `Halaman ini menjelaskan data apa saja yang DannShop kumpulkan dari pengguna dan untuk apa data tersebut digunakan.

## Data yang Dikumpulkan
- Alamat email — untuk pengiriman invoice dan komunikasi terkait pesanan.
- Data akun game/nomor tujuan (User ID, Zone ID, nomor HP, dll.) — untuk memproses pengiriman produk.
- Riwayat transaksi dan saldo — untuk member yang membuat akun.
- Alamat IP dan metadata teknis — untuk keamanan dan mencegah penyalahgunaan sistem.

## Penggunaan Data
Data hanya digunakan untuk memproses pesanan, mengirim notifikasi terkait transaksi, dan meningkatkan keamanan layanan. DannShop tidak menjual atau membagikan data pribadi ke pihak ketiga untuk tujuan pemasaran.

## Keamanan
Kata sandi disimpan dalam bentuk terenkripsi (hash), dan seluruh komunikasi data menggunakan koneksi terenkripsi (HTTPS).

## Kontak
Pertanyaan seputar privasi data bisa disampaikan lewat halaman Kontak.`;

const DEFAULT_MAINTENANCE_MESSAGE = "Situs sedang dalam pemeliharaan. Kami akan segera kembali.";

const SETTINGS_KEYS = [
  "logo_url",
  "logo_type",
  "trending_mode",
  "favicon_url",
  "faq_items",
  "tos_content",
  "privacy_content",
  "maintenance_mode",
  "maintenance_message",
] as const;

// cache() dari React: beberapa titik di satu request yang sama (root layout
// untuk favicon, halaman beranda untuk logo/trending, dsb) sekarang manggil
// fungsi ini - dibungkus supaya cuma 1 query DB per request, bukan dobel.
export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  const rows = await db.siteSetting.findMany({ where: { key: { in: [...SETTINGS_KEYS] } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  let faqItems = DEFAULT_FAQ_ITEMS;
  const rawFaqItems = map.get("faq_items");
  if (rawFaqItems) {
    try {
      const parsed = JSON.parse(rawFaqItems);
      if (Array.isArray(parsed)) faqItems = parsed;
    } catch {
      // JSON korup - jangan sampai halaman FAQ 500, fallback ke default
    }
  }

  return {
    logoUrl: map.get("logo_url") ?? null,
    logoType: map.get("logo_type") === "video" ? "video" : "image",
    trendingMode: map.get("trending_mode") === "auto" ? "auto" : "manual",
    faviconUrl: map.get("favicon_url") ?? null,
    faqItems,
    tosContent: map.get("tos_content") ?? DEFAULT_TOS_CONTENT,
    privacyContent: map.get("privacy_content") ?? DEFAULT_PRIVACY_CONTENT,
    maintenanceMode: map.get("maintenance_mode") === "on",
    maintenanceMessage: map.get("maintenance_message") || DEFAULT_MAINTENANCE_MESSAGE,
  };
});

// Dipakai proxy.ts (cek tiap request publik) - query sendiri yang cuma
// ambil 1 baris, bukan lewat getSiteSettings() yang narik semua key
// sekaligus dan biayanya sama tapi datanya tidak dipakai di sana.
export async function isMaintenanceModeOn(): Promise<boolean> {
  const row = await db.siteSetting.findUnique({ where: { key: "maintenance_mode" } });
  return row?.value === "on";
}
