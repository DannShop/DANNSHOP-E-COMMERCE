import { randomToken } from "@/lib/random-token";

// Panjang token akses invoice. 32 karakter dari alfabet 62 huruf ≈ 190 bit —
// jauh melebihi kebutuhan, tapi token ini tidak pernah diketik manusia (selalu
// lewat tautan di email/redirect), jadi tidak ada ongkos keterbacaan yang
// dikorbankan. Muat di VARCHAR(191).
const PUBLIC_TOKEN_LENGTH = 32;

/**
 * Token akses publik untuk satu Order (/invoice/[token] & API status).
 *
 * WAJIB dipakai di SETIAP tempat yang membuat Order. `Order.publicToken` sengaja
 * tidak lagi punya `@default(cuid())` di schema supaya TypeScript menolak
 * pembuatan order yang lupa mengisinya — lihat komentar kolomnya di
 * schema.prisma untuk alasan lengkapnya.
 *
 * Memakai randomToken() (randomBytes + rejection sampling), pembangkit yang sama
 * dengan API key partner dan callback secret. Bukan cuid/uuid v4 biasa: token ini
 * adalah satu-satunya hal yang berdiri antara orang asing dan data pembeli.
 */
export function generatePublicToken(): string {
  return randomToken(PUBLIC_TOKEN_LENGTH);
}
