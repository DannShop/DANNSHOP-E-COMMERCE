import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateTotpSecret, otpauthUrl, verifyTotp } from "@/lib/auth/totp";

/**
 * Vektor uji RESMI dari RFC 6238 Appendix B.
 *
 * Dipakai karena inilah satu-satunya cara membuktikan implementasi TOTP benar
 * tanpa bergantung pada pustaka pihak ketiga: kalau keluarannya cocok dengan
 * angka yang diterbitkan RFC, aplikasi autentikator mana pun (Google
 * Authenticator, Authy, 1Password) pasti cocok juga. Menguji "kode yang gw
 * hasilkan sama dengan kode yang gw hasilkan" tidak membuktikan apa-apa.
 *
 * Seed RFC untuk SHA-1 adalah ASCII "12345678901234567890".
 */
const RFC_SECRET_ASCII = "12345678901234567890";
const RFC_SECRET_BASE32 = base32Encode(Buffer.from(RFC_SECRET_ASCII, "ascii"));

// [waktu unix, kode 8 digit yang diharapkan] — Appendix B, baris SHA1.
const RFC_VECTORS: [number, string][] = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  [20000000000, "65353130"],
];

describe("TOTP terhadap vektor uji RFC 6238", () => {
  for (const [seconds, expected] of RFC_VECTORS) {
    it(`t=${seconds} menghasilkan ${expected}`, () => {
      // Vektor RFC memakai 8 digit; aplikasi autentikator memakai 6 digit
      // terakhir dari angka yang sama.
      const sixDigit = expected.slice(-6);
      expect(verifyTotp(RFC_SECRET_BASE32, sixDigit, { now: seconds * 1000, window: 0 })).toBe(true);
    });
  }
});

describe("verifyTotp", () => {
  it("menolak kode yang salah", () => {
    expect(verifyTotp(RFC_SECRET_BASE32, "000000", { now: 59_000, window: 0 })).toBe(false);
  });

  it("menerima kode dari langkah sebelumnya (toleransi jam yang meleset)", () => {
    // Jam HP orang jarang tepat sedetik. Tanpa toleransi, sebagian orang tidak
    // akan pernah bisa masuk - dan mereka akan menyalahkan passwordnya.
    const prevStep = verifyTotp(RFC_SECRET_BASE32, "287082", { now: (59 + 30) * 1000, window: 1 });
    expect(prevStep).toBe(true);
  });

  it("TIDAK menerima kode yang sudah lewat dua langkah", () => {
    // Toleransi harus sempit. Tiap langkah tambahan memperpanjang umur kode
    // yang tercuri lewat bahu atau layar yang terekam.
    expect(verifyTotp(RFC_SECRET_BASE32, "287082", { now: (59 + 90) * 1000, window: 1 })).toBe(false);
  });

  it("menolak masukan yang bukan 6 digit", () => {
    for (const bad of ["", "12345", "1234567", "abcdef", "12 34 56", "  123456  "]) {
      expect(verifyTotp(RFC_SECRET_BASE32, bad, { now: 59_000, window: 0 })).toBe(false);
    }
  });

  it("menolak rahasia yang tidak valid tanpa melempar", () => {
    // Rahasia rusak (mis. gagal didekripsi) tidak boleh menjatuhkan alur login.
    expect(verifyTotp("bukan-base32-!!!", "123456", { now: 59_000 })).toBe(false);
    expect(verifyTotp("", "123456", { now: 59_000 })).toBe(false);
  });
});

describe("base32", () => {
  it("encode lalu decode mengembalikan byte yang sama", () => {
    const bytes = Buffer.from(RFC_SECRET_ASCII, "ascii");
    expect(Buffer.from(base32Decode(base32Encode(bytes))).equals(bytes)).toBe(true);
  });

  it("encode tidak memakai padding dan hanya huruf besar A-Z2-7", () => {
    expect(base32Encode(Buffer.from("halo dunia"))).toMatch(/^[A-Z2-7]+$/);
  });
});

describe("generateTotpSecret", () => {
  it("menghasilkan rahasia base32 yang cukup panjang", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    // 20 byte = 160 bit, panjang yang direkomendasikan RFC 4226 untuk HMAC-SHA1.
    expect(base32Decode(secret).length).toBe(20);
  });

  it("tidak pernah menghasilkan nilai yang sama dua kali", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateTotpSecret()));
    expect(seen.size).toBe(50);
  });
});

describe("otpauthUrl", () => {
  it("menyusun URL yang dikenali aplikasi autentikator", () => {
    const url = otpauthUrl({ secret: "JBSWY3DPEHPK3PXP", accountName: "admin@toko.id", issuer: "DannShop" });
    expect(url.startsWith("otpauth://totp/")).toBe(true);
    expect(url).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(url).toContain("issuer=DannShop");
  });

  it("meng-encode karakter yang perlu di-escape", () => {
    // Nama toko boleh mengandung spasi; tanpa encoding, URL-nya rusak dan QR-nya
    // terbaca sebagai akun bernama potongan pertama saja.
    const url = otpauthUrl({ secret: "JBSWY3DPEHPK3PXP", accountName: "a b@c.id", issuer: "Toko Saya" });
    expect(url).not.toContain(" ");
    expect(url).toContain("Toko%20Saya");
  });
});
