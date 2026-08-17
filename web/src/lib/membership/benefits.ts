// Katalog benefit tier yang bisa dicentang/tidak admin per paket
// (MembershipTier.benefits, disimpan sebagai array key string). Katalog ini
// DIDEFINISIKAN DI KODE, bukan admin-defined - setiap key di sini WAJIB benar-
// benar diperiksa oleh sesuatu (checkout, deposit, atau tampilan admin).
// JANGAN menambah key baru di sini tanpa menyambungkannya ke titik yang
// membacanya - benefit yang cuma tercentang tapi tidak pernah dicek adalah
// janji kosong ke customer.

export interface BenefitDefinition {
  key: string;
  label: string;
  description: string;
}

export const BENEFIT_CATALOG: BenefitDefinition[] = [
  {
    key: "free_order_fee",
    label: "Bebas biaya admin (order)",
    description: "Biaya admin metode pembayaran ditiadakan saat checkout produk, walau aturan global biaya admin menyala.",
  },
  {
    key: "free_deposit_fee",
    label: "Bebas biaya admin (isi saldo)",
    description: "Biaya admin metode pembayaran ditiadakan saat isi saldo, walau aturan global biaya admin menyala.",
  },
  {
    key: "no_unique_code_order",
    label: "Tanpa kode unik (order)",
    description: "Total tagihan checkout selalu bulat (tanpa tambahan Rp1-999), walau aturan global kode unik menyala.",
  },
  {
    key: "no_unique_code_deposit",
    label: "Tanpa kode unik (isi saldo)",
    description: "Total tagihan isi saldo selalu bulat, walau aturan global kode unik menyala.",
  },
  {
    key: "deposit_bonus",
    label: "Bonus saldo tiap isi saldo",
    description: "Dapat tambahan saldo otomatis (persentase diatur lewat kolom \"Bonus deposit\" di bawah) setiap isi saldo berhasil.",
  },
  {
    key: "priority_badge",
    label: "Lencana prioritas untuk admin",
    description: "Nama tier tampil sebagai lencana di daftar Order & Deposit panel admin, supaya CS bisa memprioritaskan penanganan.",
  },
] as const;

export type BenefitKey = (typeof BENEFIT_CATALOG)[number]["key"];

/**
 * Benefit yang MASUK AKAL untuk paket mitra H2H.
 *
 * Sengaja subset, bukan seluruh katalog: mitra membeli lewat API dan tagihannya
 * dipotong dari saldo, tidak pernah melewati payment gateway. Karena itu dua
 * benefit yang menyangkut checkout - `free_order_fee` dan `no_unique_code_order`
 * - tidak pernah punya kesempatan berlaku untuk mereka. Mencentangkannya di
 * panel cuma akan jadi janji yang tidak pernah ditepati siapa pun.
 *
 * Yang tersisa semuanya menyentuh jalur ISI SALDO, dan mitra memang mengisi
 * saldo lewat /account/deposit yang sama dengan pembeli biasa.
 */
export const PARTNER_BENEFIT_KEYS = [
  "free_deposit_fee",
  "no_unique_code_deposit",
  "deposit_bonus",
  "priority_badge",
] as const satisfies readonly BenefitKey[];

export type PartnerBenefitKey = (typeof PARTNER_BENEFIT_KEYS)[number];

const PARTNER_BENEFIT_SET = new Set<string>(PARTNER_BENEFIT_KEYS);

/** Katalog yang ditampilkan di panel paket mitra, urut sesuai katalog utama. */
export const PARTNER_BENEFIT_CATALOG: BenefitDefinition[] = BENEFIT_CATALOG.filter((b) =>
  PARTNER_BENEFIT_SET.has(b.key),
);

/**
 * Saring benefit ke yang berlaku untuk mitra.
 *
 * Dipakai SAAT MEMBACA, bukan cuma saat menyimpan - konfigurasi bisa saja
 * pernah ditulis lewat jalur lain, atau daftar ini menyusut di versi berikutnya,
 * dan benefit yang sudah tidak berlaku tidak boleh diam-diam tetap dihormati.
 */
export function parsePartnerBenefits(raw: unknown): PartnerBenefitKey[] {
  return parseBenefits(raw).filter((k): k is PartnerBenefitKey => PARTNER_BENEFIT_SET.has(k));
}

const VALID_KEYS = new Set(BENEFIT_CATALOG.map((b) => b.key));

export function isValidBenefitKey(key: string): key is BenefitKey {
  return VALID_KEYS.has(key);
}

// Bentuk `benefits` mentah dari DB (Json) tidak dijamin array of string murni
// (kolom Json bisa berisi apa saja) - dibersihkan di satu tempat ini supaya
// pemanggil lain tidak perlu mengulang validasi yang sama, dan key yang sudah
// dihapus dari katalog (mis. fitur benefit di-deprecate) tidak ikut lolos.
export function parseBenefits(raw: unknown): BenefitKey[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is BenefitKey => typeof v === "string" && isValidBenefitKey(v));
}

export function hasBenefit(benefits: BenefitKey[], key: BenefitKey): boolean {
  return benefits.includes(key);
}
