import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238) — implementasi sendiri di atas `node:crypto`.
 *
 * KENAPA TIDAK MEMAKAI PUSTAKA: keseluruhan algoritmanya di bawah 60 baris, dan
 * RFC 6238 menerbitkan VEKTOR UJI resmi. Artinya kebenarannya bisa DIBUKTIKAN
 * lewat tes (lihat tests/totp.test.ts), bukan sekadar dipercayakan pada
 * dependensi. Untuk kode yang menjaga pintu masuk panel admin, bisa dibuktikan
 * lebih berharga daripada bisa dipasang cepat — dan satu dependensi lagi di
 * jalur autentikasi adalah satu pintu rantai pasok lagi.
 *
 * Parameter dikunci ke yang dipakai semua aplikasi autentikator arus utama
 * (Google Authenticator, Authy, 1Password): SHA-1, 6 digit, langkah 30 detik.
 * Bukan karena SHA-1 pilihan terbaik hari ini, tapi karena aplikasi-aplikasi itu
 * tidak menawarkan pilihan lain — memakai SHA-256 di sini berarti QR-nya
 * terpasang tapi kodenya tidak pernah cocok, tanpa pesan error apa pun.
 */

const DIGITS = 6;
const STEP_SECONDS = 30;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  // Tanpa padding "=": aplikasi autentikator menerimanya, dan rahasia tanpa
  // padding lebih enak disalin manual saat kamera tidak bisa dipakai.
  return out;
}

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  if (clean === "" || /[^A-Z2-7]/.test(clean)) throw new Error("Rahasia base32 tidak valid");

  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    value = (value << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

/** Rahasia baru, 160 bit — panjang yang direkomendasikan RFC 4226 untuk HMAC-SHA1. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function codeAtStep(secret: Uint8Array, step: number): string {
  // Penghitung 8 byte big-endian. BigInt dipakai supaya tetap benar setelah
  // tahun 2038, saat nomor langkahnya melewati batas integer 32-bit.
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));

  const digest = createHmac("sha1", Buffer.from(secret)).update(counter).digest();
  // Truncation dinamis (RFC 4226 §5.3): 4 bit terakhir menunjuk offset baca.
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];

  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * Cocokkan kode yang diketik dengan rahasia.
 *
 * TIDAK PERNAH MELEMPAR. Rahasia yang rusak — misalnya gagal didekripsi karena
 * kunci enkripsi berganti — harus berakhir sebagai "kode salah", bukan sebagai
 * error yang menjatuhkan seluruh alur login dan mengunci semua orang di luar.
 *
 * `window` = berapa langkah 30 detik ke belakang yang masih diterima. Bawaannya
 * 1 karena jam ponsel jarang tepat; tanpa toleransi, sebagian orang tidak akan
 * pernah bisa masuk dan akan menyalahkan passwordnya. Lebih dari itu tidak
 * ditawarkan: tiap langkah tambahan memperpanjang umur kode yang terlihat orang
 * lain dari balik bahu.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  options?: { now?: number; window?: number },
): boolean {
  if (!/^\d{6}$/.test(code)) return false;

  let secret: Uint8Array;
  try {
    secret = base32Decode(secretBase32);
  } catch {
    return false;
  }
  if (secret.length === 0) return false;

  const now = options?.now ?? Date.now();
  const window = options?.window ?? 1;
  const currentStep = Math.floor(now / 1000 / STEP_SECONDS);

  let matched = false;
  for (let back = 0; back <= window; back++) {
    const expected = codeAtStep(secret, currentStep - back);
    // Perbandingan waktu-tetap, dan SELURUH jendela tetap ditelusuri walau sudah
    // ketemu: keluar lebih awal membuat lamanya jawaban membocorkan langkah
    // keberapa yang cocok.
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(code))) matched = true;
  }
  return matched;
}

/** URL `otpauth://` yang dibaca aplikasi autentikator lewat QR. */
export function otpauthUrl(params: { secret: string; accountName: string; issuer: string }): string {
  const label = `${encodeURIComponent(params.issuer)}:${encodeURIComponent(params.accountName)}`;
  const query = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  // URLSearchParams meng-encode spasi jadi "+", sementara pembaca otpauth
  // mengharapkan "%20" — "Toko Saya" akan terbaca "Toko+Saya" di aplikasi.
  return `otpauth://totp/${label}?${query.toString().replace(/\+/g, "%20")}`;
}
