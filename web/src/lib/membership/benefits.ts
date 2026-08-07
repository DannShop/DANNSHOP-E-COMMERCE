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
