// Preset field tujuan per kategori produk.
//
// KENAPA ADA: sebelumnya admin harus mengetik JSON mentah
// (`[{"name":"user_id","label":"User ID"}]`) untuk setiap produk. Itu tembok bagi
// siapa pun yang bukan programmer — dan salah satu tujuan aplikasi ini adalah
// bisa dipakai orang yang tidak akan pernah membaca dokumentasi teknis. Preset
// membuat kasus yang umum jadi nol-ketikan, sementara kasus tidak umum tetap bisa
// disusun sendiri lewat builder-nya.
//
// PRESET ITU TITIK AWAL, BUKAN ATURAN. Admin selalu boleh menambah/menghapus
// field setelah preset terisi — mis. Mobile Legends butuh Zone ID sementara Free
// Fire tidak, padahal keduanya kategori "games".
//
// CATATAN PENTING soal `name`: nilainya dipakai dua kali — sebagai nama field di
// form pembeli, DAN sebagai kunci di `Order.target`. `buildCustomerNo()`
// merangkai nilainya BERURUTAN tanpa pemisah untuk dikirim ke provider, jadi
// URUTAN field menentukan bentuk nomor tujuan. Untuk game dua-input, User ID
// harus di atas Zone ID.

export interface InputFieldDef {
  name: string;
  label: string;
}

const FIELD_NOMOR_HP: InputFieldDef = { name: "no_hp", label: "Nomor HP" };

/**
 * Dipetakan lewat SLUG kategori, bukan id — id itu cuid yang berbeda di tiap
 * database (lokal vs produksi), sementara slug stabil dan sama di mana-mana.
 * Kategori yang dibuat sendiri oleh admin (slug tak dikenal) jatuh ke DEFAULT.
 */
const PRESETS: Record<string, InputFieldDef[]> = {
  games: [{ name: "user_id", label: "User ID" }],
  "pulsa-data": [FIELD_NOMOR_HP],
  "paket-internet": [FIELD_NOMOR_HP],
  "telepon-sms": [FIELD_NOMOR_HP],
  "masa-aktif": [FIELD_NOMOR_HP],
  pln: [{ name: "no_meter", label: "Nomor Meter / ID Pelanggan" }],
  "e-money": [{ name: "no_akun", label: "Nomor HP / Akun" }],
  voucher: [FIELD_NOMOR_HP],
  "aktivasi-voucher": [FIELD_NOMOR_HP],
  tagihan: [{ name: "no_pelanggan", label: "Nomor Pelanggan" }],
};

/** Dipakai untuk kategori yang slug-nya tidak dikenal (kategori buatan admin). */
const DEFAULT_PRESET: InputFieldDef[] = [{ name: "tujuan", label: "Nomor Tujuan" }];

export function presetForCategorySlug(slug: string | undefined | null): InputFieldDef[] {
  if (!slug) return [...DEFAULT_PRESET];
  // Disalin, tidak dikembalikan langsung: pemanggilnya komponen React yang akan
  // menyunting array ini. Mengembalikan rujukan ke konstanta modul berarti satu
  // produk yang disunting bisa mengubah preset untuk produk berikutnya di sesi
  // yang sama.
  const found = PRESETS[slug];
  return found ? found.map((f) => ({ ...f })) : [...DEFAULT_PRESET];
}

/**
 * Field tambahan yang sering dipakai, ditawarkan sebagai tombol cepat di builder.
 * Bukan bagian preset karena tidak berlaku untuk semua produk dalam kategorinya —
 * Zone ID contohnya cuma dipakai sebagian game.
 */
export const QUICK_ADD_FIELDS: InputFieldDef[] = [
  { name: "zone_id", label: "Zone ID" },
  { name: "server", label: "Server" },
  { name: "no_hp", label: "Nomor HP" },
  { name: "email", label: "Email" },
  { name: "username", label: "Username" },
];

/**
 * Bersihkan `name` jadi kunci yang aman dipakai sebagai nama field form dan kunci
 * objek `Order.target`: huruf kecil, angka, garis bawah. Karakter lain (spasi,
 * tanda kurung, titik) bisa membuat `formData.get(name)` tidak cocok dengan
 * definisinya sehingga field yang WAJIB diisi malah terbaca kosong saat checkout.
 */
export function normalizeFieldName(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
