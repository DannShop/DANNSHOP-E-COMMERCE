import type { MetadataRoute } from "next";
import { getInvoiceBranding } from "@/lib/invoice/branding";
import { buildManifest } from "@/lib/pwa/manifest";
import { getPwaSettings } from "@/lib/pwa/settings";

// Manifest app TOKO -> /manifest.webmanifest.
//
// Next.js otomatis menyisipkan <link rel="manifest"> dari file ini ke setiap
// halaman. Halaman di bawah /admin menimpanya lewat metadata layout admin,
// karena panel admin punya app-nya sendiri (lihat app/admin/app.webmanifest).
//
// ⚠️ Route ini WAJIB dikecualikan dari rewrite maintenance di proxy.ts. Kalau
// tidak, menyalakan maintenance mode membuat browser menerima HTML halaman
// maintenance sebagai isi manifest - dan app yang sudah terpasang di home
// screen kehilangan nama & ikonnya.
//
// force-dynamic WAJIB, dan ini sudah terbukti sekali di build.
//
// Next.js memperlakukan manifest sebagai Route Handler yang di-cache secara
// bawaan, dan membaca Prisma TIDAK dihitung sebagai request-time API - jadi
// tanpa baris ini isinya dibekukan saat build dan ditandai "○ (Static)" di
// keluaran build. Akibatnya persis kelas kegagalan senyap yang sudah beberapa
// kali menggigit repo ini: admin mengunggah ikon, panelnya bilang tersimpan,
// tapi manifest terus menyajikan nilai lama sampai ada deploy berikutnya -
// tanpa error di mana pun.
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  // brandName dan pengaturan PWA dibaca terpisah supaya kegagalan pada salah
  // satunya tidak menjatuhkan keduanya. getPwaSettings sudah menangani errornya
  // sendiri; yang perlu dijaga di sini tinggal branding.
  const [settings, brandName] = await Promise.all([
    getPwaSettings(),
    getInvoiceBranding()
      .then((b) => b.brandName)
      .catch(() => "DannShop"),
  ]);
  return buildManifest("toko", settings, brandName);
}
