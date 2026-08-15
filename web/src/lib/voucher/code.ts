// Penyeragaman kode voucher.
//
// Pembeli mengetik kodenya sendiri di checkout, dan mereka akan mengetiknya
// dengan huruf kecil, dengan spasi tersisa dari salin-tempel, atau dengan
// campuran keduanya. Menyimpan dan membandingkan bentuk mentah berarti
// "hemat10" dan "HEMAT10" jadi dua kode berbeda - dan yang menanggung
// kebingungannya pembeli yang merasa kodenya ditolak tanpa sebab.

/** Panjang maksimal kode. Cukup untuk kode kampanye, pendek untuk diketik di HP. */
export const CODE_MAX_LENGTH = 24;

/**
 * Bentuk kanonik sebuah kode: huruf besar, tanpa spasi di tepi.
 *
 * Dipakai DI KEDUA SISI - saat admin menyimpan voucher DAN saat pembeli
 * menukarkannya. Kalau hanya salah satu yang menyeragamkan, pencarian di
 * database tidak akan pernah cocok.
 */
export function normalizeVoucherCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Karakter yang diizinkan: huruf, angka, tanda hubung, garis bawah.
 *
 * Spasi ditolak dengan sengaja - kode bervoid spasi mustahil didiktekan lewat
 * telepon dan gampang rusak saat disalin. Begitu juga karakter yang punya arti
 * di URL, karena kode ini akan berakhir di tautan promosi.
 */
const VALID_CODE = /^[A-Z0-9_-]+$/;

export function isValidVoucherCode(normalized: string): boolean {
  return (
    normalized.length > 0 && normalized.length <= CODE_MAX_LENGTH && VALID_CODE.test(normalized)
  );
}
