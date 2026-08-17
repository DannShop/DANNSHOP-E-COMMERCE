import type { PwaAppKind, PwaAppSettings, PwaImage, PwaSplashSettings } from "@/lib/pwa/config";

// Layar pembuka aplikasi.
//
// Ada TIGA layar pembuka yang berbeda, dan membedakannya penting karena tidak
// semuanya bisa kita kendalikan:
//
//  1. Splash bawaan Android - dirakit Chrome sendiri dari `background_color` +
//     ikon 512 pada ukuran tetap. TIDAK bisa diperbesar, TIDAK bisa diganti
//     gambar. Satu-satunya yang bisa dilakukan adalah membuat warnanya menyatu
//     dengan ikon supaya tidak terlihat seperti logo yang ditempel di kotak.
//  2. Layar pembuka iOS - dibaca dari <link rel="apple-touch-startup-image">.
//     Tanpa itu, iOS menampilkan layar KOSONG. Ukurannya harus sama persis
//     dengan layar perangkat, jadi gambarnya dibuat on-demand oleh route
//     /pwa/splash dan tidak ada satu berkas pun yang perlu disimpan di repo.
//  3. Layar pembuka DI DALAM app (components/pwa/app-splash.tsx) - inilah yang
//     benar-benar bisa dibuat sebesar apa pun, dan berlaku di Android maupun iOS.
//
// Berkas ini murni: nol DB, nol React, nol akses jaringan.

export const SPLASH_ROUTE = "/pwa/splash";

/**
 * Batas sisi gambar yang boleh diminta dari route.
 *
 * Rendernya piksel demi piksel di server, jadi tanpa batas ini satu URL yang
 * dikarang orang (`?w=9000&h=9000`) cukup untuk menghabiskan memori fungsi.
 * Perangkat iOS terbesar butuh 2732, jadi 3000 sudah longgar.
 */
export const SPLASH_MAX_SIDE = 3000;

/**
 * Sidik jari pendek dari segala hal yang mengubah RUPA layar pembuka.
 *
 * Dipakai sebagai parameter `v` pada URL gambar, dan itulah yang membuat
 * gambarnya boleh di-cache selamanya: ganti ikon, warna, atau gambar splash =
 * URL berubah = perangkat mengambil yang baru. Tanpa ini pilihannya cuma dua,
 * dan dua-duanya buruk: cache pendek (setiap pemasangan me-render ulang gambar
 * 2732px) atau cache panjang (perubahan admin tidak pernah sampai ke HP).
 *
 * FNV-1a, bukan sha256: ini bukan pengaman apa-apa, cuma penanda versi. Tabrakan
 * hash paling buruk berarti satu perangkat memakai layar pembuka lama sampai
 * cache-nya habis.
 */
export function appearanceVersion(app: PwaAppSettings): string {
  const parts = [
    app.backgroundColor,
    app.icon?.any ?? "",
    app.splash.portrait?.url ?? "",
    app.splash.landscape?.url ?? "",
  ].join("|");

  let hash = 0x811c9dc5;
  for (let i = 0; i < parts.length; i++) {
    hash ^= parts.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function splashImageUrl(
  kind: PwaAppKind,
  version: string,
  width: number,
  height: number,
): string {
  return `${SPLASH_ROUTE}?app=${kind}&w=${width}&h=${height}&v=${version}`;
}

/**
 * Gambar mana yang dipakai untuk layar seukuran ini.
 *
 * Lanskap jatuh ke gambar potret kalau varian lanskapnya tidak diunggah -
 * di-cover, jadi yang terlihat tinggal pita tengahnya. Itu disengaja: isi yang
 * penting (logo) memang ditaruh di tengah, dan pita tengah yang terpotong jauh
 * lebih baik daripada gambar utuh dengan dua batang kosong di kiri-kanan.
 */
export function pickSplashImage(
  splash: PwaSplashSettings,
  box: { width: number; height: number },
): PwaImage | null {
  if (box.width > box.height) return splash.landscape ?? splash.portrait;
  return splash.portrait;
}

/** Ukuran gambar setelah diperbesar/dikecilkan agar MENUTUPI kotak target. */
export function coverSize(
  src: { width: number; height: number },
  box: { width: number; height: number },
): { width: number; height: number } {
  const scale = Math.max(box.width / src.width, box.height / src.height);
  return {
    width: Math.max(1, Math.ceil(src.width * scale)),
    height: Math.max(1, Math.ceil(src.height * scale)),
  };
}

/**
 * Sisi logo pada layar pembuka OTOMATIS (saat admin belum mengunggah gambar).
 *
 * Dipatok ke sisi TERPENDEK supaya logo tidak melebar keluar layar saat
 * perangkat dimiringkan, dan 42% dipilih karena kira-kira tiga kali lipat
 * ukuran logo pada splash bawaan Android - itu seluruh alasan layar ini ada.
 */
export function autoLogoSize(box: { width: number; height: number }): number {
  return Math.round(Math.min(box.width, box.height) * 0.42);
}

interface IosDevice {
  /** Untuk dibaca manusia saat daftar ini diperiksa lagi bertahun-tahun lagi. */
  label: string;
  /** Lebar & tinggi dalam CSS px pada orientasi POTRET. */
  width: number;
  height: number;
  /** -webkit-device-pixel-ratio. */
  ratio: number;
}

/**
 * Perangkat iOS yang punya layar pembuka sendiri.
 *
 * ⚠️ Daftar ini HARUS lengkap per perangkat: iOS memilih gambarnya lewat media
 * query yang mencocokkan ukuran layar PERSIS, dan perangkat yang tidak ada di
 * sini tidak jatuh ke gambar terdekat - ia kembali menampilkan layar kosong.
 * Perangkat baru cukup ditambahkan satu baris di sini; gambarnya dibuat
 * on-demand, jadi tidak ada aset yang perlu diproduksi.
 *
 * device-width & device-height SELALU ditulis dalam nilai POTRET, termasuk
 * untuk entri lanskap. Itu konvensi yang sama dipakai pwa-asset-generator, dan
 * itu yang benar: pembeda orientasinya ada di `orientation`, bukan di angkanya.
 */
export const IOS_DEVICES: readonly IosDevice[] = [
  // iPhone
  { label: "iPhone SE (gen 1), 5s", width: 320, height: 568, ratio: 2 },
  { label: "iPhone 8, SE (gen 2/3)", width: 375, height: 667, ratio: 2 },
  { label: "iPhone 8 Plus", width: 414, height: 736, ratio: 3 },
  { label: "iPhone X, XS, 11 Pro, 12/13 mini", width: 375, height: 812, ratio: 3 },
  { label: "iPhone XR, 11", width: 414, height: 896, ratio: 2 },
  { label: "iPhone XS Max, 11 Pro Max", width: 414, height: 896, ratio: 3 },
  { label: "iPhone 12, 13, 14", width: 390, height: 844, ratio: 3 },
  { label: "iPhone 12/13 Pro Max, 14 Plus", width: 428, height: 926, ratio: 3 },
  { label: "iPhone 14 Pro, 15, 16", width: 393, height: 852, ratio: 3 },
  { label: "iPhone 14 Pro Max, 15/16 Plus", width: 430, height: 932, ratio: 3 },
  { label: "iPhone 16 Pro", width: 402, height: 874, ratio: 3 },
  { label: "iPhone 16 Pro Max", width: 440, height: 956, ratio: 3 },
  // iPad
  { label: "iPad mini (gen 6)", width: 744, height: 1133, ratio: 2 },
  { label: 'iPad 9,7" & mini lama', width: 768, height: 1024, ratio: 2 },
  { label: 'iPad 10,2"', width: 810, height: 1080, ratio: 2 },
  { label: 'iPad Air 10,9"', width: 820, height: 1180, ratio: 2 },
  { label: 'iPad Pro 10,5"', width: 834, height: 1112, ratio: 2 },
  { label: 'iPad Pro 11"', width: 834, height: 1194, ratio: 2 },
  { label: 'iPad Pro 12,9"', width: 1024, height: 1366, ratio: 2 },
];

export interface StartupImage {
  url: string;
  media: string;
}

/**
 * Daftar <link rel="apple-touch-startup-image"> untuk satu app.
 *
 * Potret DAN lanskap dua-duanya dibuat. Terdengar boros - 19 perangkat jadi 38
 * tag di setiap halaman - tapi isinya nyaris identik satu sama lain, jadi
 * setelah gzip tambahannya sekitar 1KB. Melewatkan lanskap berarti app yang
 * dibuka sambil perangkat dimiringkan (paling mungkin di iPad, yang justru
 * dipakai untuk panel admin) kembali menampilkan layar kosong.
 */
export function buildStartupImages(kind: PwaAppKind, version: string): StartupImage[] {
  const images: StartupImage[] = [];
  for (const device of IOS_DEVICES) {
    const base = `(device-width: ${device.width}px) and (device-height: ${device.height}px) and (-webkit-device-pixel-ratio: ${device.ratio})`;
    const w = device.width * device.ratio;
    const h = device.height * device.ratio;
    images.push({
      url: splashImageUrl(kind, version, w, h),
      media: `${base} and (orientation: portrait)`,
    });
    images.push({
      url: splashImageUrl(kind, version, h, w),
      media: `${base} and (orientation: landscape)`,
    });
  }
  return images;
}
