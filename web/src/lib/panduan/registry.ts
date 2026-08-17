import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Daftar panduan yang tampil di /admin/panduan.
 *
 * SEMUA berkasnya hidup di `src/content/`, bukan di `docs/` di akar repo, dan itu
 * bukan pilihan gaya: `docs/` berada DI LUAR root Next.js sehingga tidak pernah
 * ikut terbawa ke bundle serverless — halamannya akan mulus di lokal lalu 500 di
 * produksi. `docs/` tetap jadi rumah catatan riset & audit yang memang untuk
 * dibaca dari repo, bukan dari panel admin.
 *
 * Satu berkas = satu salinan. `api-partner.md` sengaja DIPAKAI BERSAMA dengan
 * /mitra/dokumentasi alih-alih disalin: dua salinan berarti yang dibaca admin dan
 * yang dibaca mitra bisa berbeda, dan yang salah justru yang dipegang mitra.
 */
export interface Panduan {
  slug: string;
  title: string;
  summary: string;
  /** Relatif terhadap `src/content/`. */
  file: string;
  /** Ditampilkan sebagai penanda siapa yang memakainya. */
  audience: "Admin" | "Mitra";
}

export const PANDUAN: Panduan[] = [
  {
    slug: "tambah-produk",
    title: "Tambah Produk",
    summary:
      "Dua jalur menambah produk: tarik dari price list provider, atau isi manual untuk barang yang kamu kirim sendiri.",
    file: "panduan/tambah-produk.md",
    audience: "Admin",
  },
  {
    slug: "provider-relay",
    title: "Provider & Relay IP",
    summary:
      "Menghubungkan Digiflazz & OkeConnect, membaca penolakan mereka, dan menjaga relay ber-IP tetap tetap hidup.",
    file: "panduan/provider-relay.md",
    audience: "Admin",
  },
  {
    slug: "payment-gateway",
    title: "Payment Gateway",
    summary:
      "Mode Snap vs Core API, dua jebakan Midtrans yang wajib diingat, dan urutan pengecekan saat pembayaran bermasalah.",
    file: "panduan/payment-gateway.md",
    audience: "Admin",
  },
  {
    slug: "reseller",
    title: "Program Reseller",
    summary:
      "Alur pendaftaran & aktivasi, mengatur paket, aturan naik paket, dan mengelola peserta program.",
    file: "panduan/reseller.md",
    audience: "Admin",
  },
  {
    slug: "karyawan-peran",
    title: "Karyawan & Peran",
    summary:
      "Merekrut karyawan, 9 izin yang tersedia, kenapa refund dipisah dari kelola pesanan, dan kapan perubahan izin berlaku.",
    file: "panduan/karyawan-peran.md",
    audience: "Admin",
  },
  {
    slug: "laba-modal",
    title: "Modal, Laba & Analytics",
    summary:
      "Dari mana modal datang untuk produk otomatis vs manual, rumus laba, dan cara membaca dashboard & analytics.",
    file: "panduan/laba-modal.md",
    audience: "Admin",
  },
  {
    slug: "tampilan-css",
    title: "Tampilan & CSS Kustom",
    summary:
      "Slot HTML, CSS kustom, apa yang otomatis dibuang penyaring, kelas yang aman disasar, dan cara memulihkan tampilan yang rusak.",
    file: "panduan/tampilan-css.md",
    audience: "Admin",
  },
  {
    slug: "invoice-struk",
    title: "Invoice, Struk & Email",
    summary:
      "Branding dokumen, 9 template email dan placeholder-nya, konfirmasi pesanan manual, serta pengaturan cetak struk.",
    file: "panduan/invoice-struk.md",
    audience: "Admin",
  },
  {
    slug: "api-internal",
    title: "API Internal & Webhook",
    summary:
      "Seluruh endpoint selain API Partner: webhook Midtrans & provider, cron, endpoint status publik, dan rate limit yang berlaku.",
    file: "panduan/api-internal.md",
    audience: "Admin",
  },
  {
    slug: "api-partner",
    title: "API Partner (H2H)",
    summary:
      "Spesifikasi API yang dipakai mitra reseller. Ini dokumen yang sama persis dengan yang mereka baca di portal mitra.",
    file: "api-partner.md",
    audience: "Mitra",
  },
];

export function findPanduan(slug: string): Panduan | undefined {
  return PANDUAN.find((p) => p.slug === slug);
}

export async function readPanduan(panduan: Panduan): Promise<string> {
  // `file` selalu berasal dari daftar tetap di atas, tidak pernah dari input
  // pengguna — pencocokan slug terjadi lebih dulu di findPanduan.
  return readFile(path.join(process.cwd(), "src", "content", panduan.file), "utf8");
}
