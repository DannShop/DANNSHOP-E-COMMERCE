import { sanitizeHexColor } from "@/lib/invoice/branding";

// Pengaturan "Aplikasi Mobile" - identitas app yang dipasang ke home screen.
//
// File ini SENGAJA MURNI (tidak menyentuh Prisma sama sekali) supaya bisa diuji
// tanpa database dan supaya builder manifest di manifest.ts tidak ikut menarik
// klien DB. Yang menyentuh DB ada di settings.ts sebelah.
//
// Ada DUA app yang bisa dipasang dari satu origin ini:
//   - "toko"  -> start_url "/",      dipasang pembeli
//   - "admin" -> start_url "/admin", dipasang pemilik toko
// Browser membedakan keduanya lewat field `id` di manifest, bukan lewat URL
// manifest-nya. Dua id berbeda = dua ikon terpisah di home screen.

export type PwaAppKind = "toko" | "admin";

export interface PwaIconSet {
  /** purpose "any" - ikon apa adanya. Dipakai iOS & sebagai cadangan Android. */
  any: string;
  /** purpose "maskable" - isinya sudah dikecilkan ke zona aman mask Android. */
  maskable: string;
}

export interface PwaAppSettings {
  /** Kosong = ikut nama brand dari Invoice & Struk. */
  name: string;
  /** Kosong = diturunkan dari `name`. Yang tampil di bawah ikon home screen. */
  shortName: string;
  /** null = pakai ikon bawaan yang ikut dibundel di /public/icons. */
  icon: PwaIconSet | null;
}

export interface PwaSettings {
  toko: PwaAppSettings;
  admin: PwaAppSettings;
  /** Warna bilah status saat app berjalan standalone. */
  themeColor: string;
  /** Warna layar pembuka sebelum app selesai dimuat. */
  backgroundColor: string;
}

// Ikon bawaan. Sudah ada di repo sejak deploy pertama, jadi app SELALU bisa
// dipasang walau admin belum pernah membuka panel Aplikasi Mobile sekali pun.
export const DEFAULT_ICONS: Record<PwaAppKind, PwaIconSet> = {
  toko: { any: "/icons/app-toko-512.png", maskable: "/icons/app-toko-maskable-512.png" },
  admin: { any: "/icons/app-admin-512.png", maskable: "/icons/app-admin-maskable-512.png" },
};

export const DEFAULT_THEME_COLOR = "#7C3AED";
export const DEFAULT_BACKGROUND_COLOR = "#FFFFFF";

/** Satu-satunya ukuran yang dihasilkan pengunggah maupun ikon bawaan. */
export const ICON_SIZE_PX = 512;

/**
 * Panjang maksimum `short_name`.
 *
 * Bukan aturan spesifikasi, melainkan batas praktis: Android memotong label di
 * bawah ikon sekitar 12 karakter, dan nama yang terpotong di tengah kata lebih
 * buruk daripada nama yang sengaja dipendekkan admin sendiri.
 */
export const SHORT_NAME_MAX = 12;

export const SETTINGS_KEY = "pwa_settings";

function parseApp(raw: unknown): PwaAppSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  // Ikon hanya diterima kalau KEDUA varian ada. Setengah pasang berarti unggahan
  // gagal di tengah jalan; jatuh ke bawaan jauh lebih baik daripada manifest
  // yang menunjuk ke satu URL yang tidak pernah ada - Chrome menolak memasang
  // app-nya sama sekali kalau ikonnya gagal diunduh.
  const icon = (o.icon && typeof o.icon === "object" ? o.icon : {}) as Record<string, unknown>;
  const anyUrl = typeof icon.any === "string" ? icon.any.trim() : "";
  const maskableUrl = typeof icon.maskable === "string" ? icon.maskable.trim() : "";

  return {
    name: typeof o.name === "string" ? o.name.trim() : "",
    shortName: typeof o.shortName === "string" ? o.shortName.trim().slice(0, SHORT_NAME_MAX) : "",
    icon: anyUrl && maskableUrl ? { any: anyUrl, maskable: maskableUrl } : null,
  };
}

/**
 * Membaca nilai tersimpan dan menyaringnya SAAT DIBACA, bukan cuma saat ditulis.
 *
 * Pola yang sama dipakai getStorefrontAppearance: baris SiteSetting bisa saja
 * pernah ditulis lewat jalur lain (skrip, akses DB langsung, versi kode lama),
 * dan manifest yang dipakai memasang app tidak boleh bergantung pada asumsi
 * bahwa isi DB pasti bersih.
 */
export function parsePwaSettings(raw: unknown): PwaSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    toko: parseApp(o.toko),
    admin: parseApp(o.admin),
    themeColor: sanitizeHexColor(o.themeColor, DEFAULT_THEME_COLOR),
    backgroundColor: sanitizeHexColor(o.backgroundColor, DEFAULT_BACKGROUND_COLOR),
  };
}

export function defaultPwaSettings(): PwaSettings {
  return parsePwaSettings({});
}

/**
 * Nama lengkap & nama pendek yang benar-benar dipakai manifest.
 *
 * Kalau admin tidak mengisi apa pun, keduanya diturunkan dari nama brand yang
 * SUDAH ada di Invoice & Struk. Menyalin nama toko ke tempat kedua cuma bikin
 * dua sumber kebenaran yang bisa berbeda diam-diam.
 */
export function resolveAppNames(
  app: PwaAppSettings,
  kind: PwaAppKind,
  brandName: string,
): { name: string; shortName: string } {
  // Imbuhan " Admin" HANYA ditempel pada nama turunan. Kalau admin mengetik
  // namanya sendiri, itu dipakai apa adanya - kalau tidak, mengetik "DannShop
  // Admin" akan keluar sebagai "DannShop Admin Admin".
  const name = app.name || (kind === "admin" ? `${brandName} Admin` : brandName);
  // Nama pendek default memakai KATA PERTAMA, bukan potongan huruf: "DannShop
  // Digital" jadi "DannShop", bukan "DannShop Dig". Kalau kata pertamanya saja
  // sudah kepanjangan, baru dipotong.
  //
  // Khusus admin nilainya "Admin", BUKAN kata pertama nama brand. Kedua app
  // duduk bersebelahan di home screen yang sama, dan menurunkan keduanya dari
  // nama brand yang sama menghasilkan dua label identik - satu-satunya pembeda
  // tinggal warna ikonnya.
  const fallbackShort =
    kind === "admin" ? "Admin" : name.split(/\s+/)[0].slice(0, SHORT_NAME_MAX);
  return { name, shortName: app.shortName || fallbackShort };
}

export function resolveIcon(app: PwaAppSettings, kind: PwaAppKind): PwaIconSet {
  return app.icon ?? DEFAULT_ICONS[kind];
}
