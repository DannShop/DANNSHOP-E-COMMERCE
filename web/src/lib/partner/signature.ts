import { createHash, createHmac } from "node:crypto";

// Fungsi murni (nol DB, nol env) di sekitar autentikasi partner — dipisah dari
// auth.ts supaya bisa diuji unit sesuai konvensi repo ini (tests/ hanya menguji
// pure function, bukan orkestrasi DB).

// Tanda tangan request masuk: md5(username + apiKey + salt).
//
// `salt` berbeda per operasi dan itu disengaja: kalau semua endpoint memakai
// tanda tangan yang sama persis, satu tanda tangan yang tertangkap di log proxy
// partner bisa diputar ulang ke endpoint mana pun. Untuk transaksi, salt = ref_id
// (unik per transaksi) sehingga tanda tangan tidak bisa dipakai ulang untuk
// transaksi lain sama sekali.
//
// MD5 dipilih BUKAN karena kekuatan kriptografisnya — ia dipakai di sini sebagai
// bukti kepemilikan secret bersama, bukan sebagai hash tahan tabrakan, dan apiKey
// tidak pernah melewati kabel. Alasannya kompatibilitas: ini pola yang sama persis
// dengan Digiflazz/OkeConnect/Serpul, jadi partner PPOB Indonesia bisa menyalin
// kode integrasi yang sudah mereka punya tanpa menulis apa pun yang baru.
export function computeSign(username: string, apiKey: string, salt: string): string {
  return createHash("md5").update(`${username}${apiKey}${salt}`).digest("hex");
}

// Salt tetap untuk endpoint yang tidak punya ref_id.
export const SIGN_SALT_BALANCE = "depo";
export const SIGN_SALT_PRICE_LIST = "pricelist";

// Perbandingan tanda tangan yang timing-safe TANPA membocorkan panjang input.
//
// safeCompare() di lib/crypto.ts mengembalikan false lebih awal saat panjangnya
// beda — aman untuk secret berpanjang tetap, tapi di sini `provided` datang dari
// penyerang dan bisa berpanjang apa pun. Menghash keduanya dulu membuat kedua sisi
// selalu 32 byte, jadi tidak ada jalur cepat yang bisa diukur.
export function signatureMatches(expected: string, provided: string): boolean {
  const a = createHash("sha256").update(expected.toLowerCase()).digest();
  const b = createHash("sha256").update(provided.toLowerCase()).digest();
  return a.equals(b);
}

// Whitelist IP. NULL/kosong = tidak dibatasi (lihat komentar kolom di schema).
export function isIpAllowed(whitelist: string | null | undefined, ip: string): boolean {
  if (!whitelist) return true;
  const allowed = whitelist
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return true;
  return allowed.includes(ip);
}

export interface CustomerNoParseResult {
  ok: boolean;
  target?: Record<string, string>;
  error?: string;
}

// Menerjemahkan `customer_no` milik partner menjadi objek `Order.target` internal.
//
// Formatnya sengaja PIPE-separated ("12345678|2201"), bukan sambung-menyambung
// seperti yang dikirim ke Digiflazz. Alasannya: buildCustomerNo() menggabungkan
// nilai TANPA pemisah apa pun, jadi hasilnya mustahil dibongkar balik — "123456782201"
// bisa berarti user_id 12345678 + zone 2201 atau user_id 1234567 + zone 82201, dan
// menebak salah berarti diamond terkirim ke akun orang lain tanpa cara membatalkan.
// Pemisah eksplisit memindahkan keputusan itu ke partner, yang memang tahu jawabannya.
//
// Produk berfield tunggal (pulsa, token listrik, e-money) tidak perlu pipe sama sekali.
export function parseCustomerNo(
  inputFields: { name: string; label: string }[],
  customerNo: string,
): CustomerNoParseResult {
  const parts = customerNo.split("|").map((p) => p.trim());
  if (parts.length !== inputFields.length) {
    const contoh = inputFields.map((f) => f.label).join("|");
    return {
      ok: false,
      error: `customer_no harus berisi ${inputFields.length} bagian dipisah "|" dengan urutan: ${contoh}`,
    };
  }
  const target: Record<string, string> = {};
  for (let i = 0; i < inputFields.length; i++) {
    if (!parts[i]) return { ok: false, error: `Bagian "${inputFields[i].label}" pada customer_no kosong.` };
    target[inputFields[i].name] = parts[i];
  }
  return { ok: true, target };
}

// Tanda tangan callback KELUAR ke partner. HMAC-SHA256 atas body mentah — beda
// dari MD5 di atas dan itu disengaja: di sini kita yang memilih algoritmanya
// (tidak ada kompatibilitas warisan yang harus diikuti), dan partner cuma perlu
// memanggil satu fungsi hash_hmac bawaan untuk memverifikasinya.
export function signCallbackBody(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}
