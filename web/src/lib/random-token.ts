import { randomBytes } from "node:crypto";

/**
 * Pembangkit token acak untuk kredensial (API key partner, secret callback).
 *
 * Rejection sampling, bukan `byte % panjang`: modulo biasa membuat karakter di
 * awal alfabet lebih sering muncul kalau 256 tidak habis dibagi panjang alfabet.
 * Untuk angka acak biasa itu tidak penting; untuk kredensial itu mengurangi
 * entropi efektif secara diam-diam.
 *
 * Alfabetnya sengaja alfanumerik penuh (62 karakter), BEDA dari
 * PASSWORD_ALPHABET di actions/admin-users.ts yang membuang 0/O/1/l/I. Password
 * reset di sana memang dibacakan admin ke customer lewat telepon/chat sehingga
 * keterbacaan lebih penting daripada entropi; API key disalin-tempel ke file
 * konfigurasi dan tidak pernah dibaca manusia, jadi tidak ada alasan membuang
 * 5 karakter. (Fungsi di sana tidak bisa diimpor ke sini: file ber-"use server"
 * hanya boleh meng-export async function.)
 */
const TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function randomToken(length: number): string {
  const limit = Math.floor(256 / TOKEN_ALPHABET.length) * TOKEN_ALPHABET.length;
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte >= limit) continue;
      out += TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}
