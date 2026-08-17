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

/** Satu-satunya daftar app, supaya perulangan tidak pernah melewatkan salah satu. */
export const PWA_APP_KINDS = ["toko", "admin"] as const satisfies readonly PwaAppKind[];

export interface PwaIconSet {
  /** purpose "any" - ikon apa adanya. Dipakai iOS & sebagai cadangan Android. */
  any: string;
  /** purpose "maskable" - isinya sudah dikecilkan ke zona aman mask Android. */
  maskable: string;
  /**
   * Warna latar yang BENAR-BENAR dicat ke dalam berkas ikon saat dibuat.
   *
   * Disimpan karena ikon dirender sekali lalu dibekukan jadi PNG, sedangkan
   * `backgroundColor` bisa diganti kapan saja sesudahnya. Kalau keduanya
   * berbeda, layar pembuka memakai warna baru sementara ikonnya masih membawa
   * warna lama - dan gejalanya persis keluhan yang memulai pekerjaan ini:
   * logo terlihat seperti kotak yang ditempel di atas latar yang beda warna.
   * Panel memakai selisih ini untuk menyuruh admin mengunggah ulang ikonnya.
   *
   * Kosong = ikon tersimpan dari versi kode lama yang belum mencatatnya. Itu
   * bukan galat, jadi tidak boleh memunculkan peringatan apa pun.
   */
  background: string;
}

/**
 * Gambar yang ukurannya ikut disimpan.
 *
 * Lebar & tinggi WAJIB ada karena renderer layar pembuka iOS harus menghitung
 * sendiri skala "cover" ke ukuran layar tiap perangkat, dan satu-satunya
 * alternatif adalah mengunduh lalu mendekode gambarnya di server hanya untuk
 * mengetahui dimensinya. Nilainya dilaporkan browser yang sudah mendekode
 * gambar itu saat mengunggah - tidak dipercaya mentah-mentah, tapi salah nilai
 * paling buruk hanya menghasilkan skala yang meleset, bukan lubang keamanan.
 */
export interface PwaImage {
  url: string;
  width: number;
  height: number;
}

export interface PwaSplashSettings {
  /** null = layar pembuka dirakit otomatis dari warna latar + ikon. */
  portrait: PwaImage | null;
  /** null = layar lanskap memakai gambar potret, di-cover. */
  landscape: PwaImage | null;
}

export interface PwaAppSettings {
  /** Kosong = ikut nama brand dari Invoice & Struk. */
  name: string;
  /** Kosong = diturunkan dari `name`. Yang tampil di bawah ikon home screen. */
  shortName: string;
  /** null = pakai ikon bawaan yang ikut dibundel di /public/icons. */
  icon: PwaIconSet | null;
  /** Warna bilah status saat app berjalan standalone. */
  themeColor: string;
  /** Warna layar pembuka, dan warna yang dicat di belakang logo saat ikon dibuat. */
  backgroundColor: string;
  splash: PwaSplashSettings;
}

export interface PwaSettings {
  toko: PwaAppSettings;
  admin: PwaAppSettings;
}

// Ikon bawaan. Sudah ada di repo sejak deploy pertama, jadi app SELALU bisa
// dipasang walau admin belum pernah membuka panel Aplikasi Mobile sekali pun.
export const DEFAULT_ICONS: Record<PwaAppKind, PwaIconSet> = {
  toko: {
    any: "/icons/app-toko-512.png",
    maskable: "/icons/app-toko-maskable-512.png",
    background: "#7C3AED",
  },
  admin: {
    any: "/icons/app-admin-512.png",
    maskable: "/icons/app-admin-maskable-512.png",
    background: "#0F172A",
  },
};

/**
 * Warna bawaan, DIPISAH PER APP.
 *
 * Satu warna untuk dua app mustahil benar: ikon toko bawaan violet, ikon admin
 * bawaan slate gelap, dan warna latar yang tidak cocok dengan ikonnya justru
 * yang membuat layar pembuka terlihat seperti logo kecil yang ditempel di atas
 * kotak berbeda warna. Nilainya sengaja diambil dari warna dominan masing-masing
 * ikon bawaan, jadi tanpa admin menyentuh apa pun keduanya sudah menyatu.
 */
export const DEFAULT_COLORS: Record<PwaAppKind, { themeColor: string; backgroundColor: string }> = {
  toko: { themeColor: "#7C3AED", backgroundColor: "#7C3AED" },
  admin: { themeColor: "#0F172A", backgroundColor: "#0F172A" },
};

/** Satu-satunya ukuran yang dihasilkan pengunggah maupun ikon bawaan. */
export const ICON_SIZE_PX = 512;

/**
 * Sisi terpanjang gambar layar pembuka setelah dinormalkan di browser.
 *
 * Perangkat iOS terbesar (iPad Pro 12,9") memakai layar pembuka 2048x2732, jadi
 * nilai ini sengaja sedikit di atasnya - gambar yang lebih kecil dari layar akan
 * diperbesar saat dirender dan pinggirannya melunak.
 */
export const SPLASH_MAX_DIMENSION = 2800;

/**
 * Panjang maksimum `short_name`.
 *
 * Bukan aturan spesifikasi, melainkan batas praktis: Android memotong label di
 * bawah ikon sekitar 12 karakter, dan nama yang terpotong di tengah kata lebih
 * buruk daripada nama yang sengaja dipendekkan admin sendiri.
 */
export const SHORT_NAME_MAX = 12;

export const SETTINGS_KEY = "pwa_settings";

function parseImage(raw: unknown): PwaImage | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const url = typeof o.url === "string" ? o.url.trim() : "";
  const width = typeof o.width === "number" ? Math.round(o.width) : 0;
  const height = typeof o.height === "number" ? Math.round(o.height) : 0;
  // Dimensi yang tidak masuk akal dibuang bersama gambarnya, bukan diperbaiki
  // diam-diam: gambar tanpa ukuran yang bisa dipercaya tidak bisa dihitung
  // skalanya, dan jatuh ke layar pembuka otomatis jauh lebih baik daripada
  // gambar yang meleset entah ke mana.
  if (!url || width < 1 || height < 1 || width > 10000 || height > 10000) return null;
  return { url, width, height };
}

function parseApp(raw: unknown, kind: PwaAppKind, legacy: { theme: string; background: string }): PwaAppSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  // Ikon hanya diterima kalau KEDUA varian ada. Setengah pasang berarti unggahan
  // gagal di tengah jalan; jatuh ke bawaan jauh lebih baik daripada manifest
  // yang menunjuk ke satu URL yang tidak pernah ada - Chrome menolak memasang
  // app-nya sama sekali kalau ikonnya gagal diunduh.
  const icon = (o.icon && typeof o.icon === "object" ? o.icon : {}) as Record<string, unknown>;
  const anyUrl = typeof icon.any === "string" ? icon.any.trim() : "";
  const maskableUrl = typeof icon.maskable === "string" ? icon.maskable.trim() : "";

  const splash = (o.splash && typeof o.splash === "object" ? o.splash : {}) as Record<string, unknown>;

  return {
    name: typeof o.name === "string" ? o.name.trim() : "",
    shortName: typeof o.shortName === "string" ? o.shortName.trim().slice(0, SHORT_NAME_MAX) : "",
    icon:
      anyUrl && maskableUrl
        ? { any: anyUrl, maskable: maskableUrl, background: sanitizeHexColor(icon.background, "") }
        : null,
    themeColor: sanitizeHexColor(o.themeColor, legacy.theme || DEFAULT_COLORS[kind].themeColor),
    backgroundColor: sanitizeHexColor(
      o.backgroundColor,
      legacy.background || DEFAULT_COLORS[kind].backgroundColor,
    ),
    splash: { portrait: parseImage(splash.portrait), landscape: parseImage(splash.landscape) },
  };
}

/**
 * Membaca nilai tersimpan dan menyaringnya SAAT DIBACA, bukan cuma saat ditulis.
 *
 * Pola yang sama dipakai getStorefrontAppearance: baris SiteSetting bisa saja
 * pernah ditulis lewat jalur lain (skrip, akses DB langsung, versi kode lama),
 * dan manifest yang dipakai memasang app tidak boleh bergantung pada asumsi
 * bahwa isi DB pasti bersih.
 *
 * ⚠️ Termasuk membaca bentuk LAMA: warna dulu tersimpan sekali di tingkat atas
 * (satu pasang untuk dua app) sebelum dipisah per app. Nilai lama itu dipakai
 * sebagai bawaan kedua app, jadi warna yang sudah disetel admin tidak hilang
 * diam-diam pada deploy yang memisahkannya - kegagalan yang tidak menampilkan
 * error di mana pun dan baru ketahuan dari layar pembuka yang berubah sendiri.
 */
export function parsePwaSettings(raw: unknown): PwaSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const legacy = {
    theme: sanitizeHexColor(o.themeColor, ""),
    background: sanitizeHexColor(o.backgroundColor, ""),
  };
  return {
    toko: parseApp(o.toko, "toko", legacy),
    admin: parseApp(o.admin, "admin", legacy),
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
  app: Pick<PwaAppSettings, "name" | "shortName">,
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

export function resolveIcon(app: Pick<PwaAppSettings, "icon">, kind: PwaAppKind): PwaIconSet {
  return app.icon ?? DEFAULT_ICONS[kind];
}

/**
 * true kalau latar yang tercat DI DALAM ikon berbeda dari warna latar app.
 *
 * Inilah satu-satunya penyebab yang bisa dideteksi program dari keluhan "logo
 * kecil terlihat seperti kotak yang ditempel di layar pembuka": ikon adalah PNG
 * yang latarnya sudah dibekukan ke dalam berkas, sedangkan warna latar app bisa
 * diganti kapan saja setelahnya. Begitu keduanya berbeda, batas kotak ikon jadi
 * terlihat.
 *
 * Berlaku untuk ikon BAWAAN juga, bukan cuma ikon unggahan — dan justru di
 * situlah kasus terbanyaknya: warna latar bawaan dulu putih untuk kedua app,
 * sementara ikon toko bawaan violet dan ikon admin bawaan slate gelap.
 *
 * Yang tidak bisa dinilai cuma ikon unggahan dari versi kode sebelum warnanya
 * ikut dicatat; itu mengembalikan false, bukan menebak.
 */
export function isIconBackgroundStale(
  // Bentuk sempit, supaya panel bisa memanggil aturan yang SAMA sambil memegang
  // ikon & warna yang sedang disunting (belum jadi PwaAppSettings utuh). Kalau
  // panel menyalin aturannya sendiri, dua salinan itu akan menyimpang dan
  // gejalanya peringatan yang muncul di layar tapi tidak sesuai kenyataan.
  app: Pick<PwaAppSettings, "icon" | "backgroundColor">,
  kind: PwaAppKind,
): boolean {
  const iconBackground = resolveIcon(app, kind).background;
  if (!iconBackground) return false;
  return iconBackground.toUpperCase() !== app.backgroundColor.toUpperCase();
}
