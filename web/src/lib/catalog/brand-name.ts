/**
 * Rapikan nama brand provider jadi nama yang layak dipajang ke pembeli.
 *
 * KENAPA PERLU: satu brand = satu Product, jadi nama brand mentah langsung jadi
 * JUDUL yang dilihat pembeli di katalog. Price list OkeConnect (471 brand)
 * memuat nama seperti `TPG Diamond Mobile Legends`, `Isat Cetak Vcr Freedom Mini
 * North Sumatra`, dan `+Masa Aktif Tri` — dibiarkan apa adanya, katalog terbaca
 * seperti dump data dan pembeli tidak menemukan produk yang sebenarnya ada.
 *
 * SEMUA ATURAN DI SINI DITURUNKAN DARI DATA, bukan dari dugaan. Angka yang
 * disebut di tiap kelompok adalah jumlah kemunculan sesungguhnya pada price list
 * yang diambil 2026-08-15.
 *
 * SIFATNYA SARAN, BUKAN KEPUTUSAN. Hasil fungsi ini cuma mengisi awal kolom
 * "Nama produk" di halaman impor — admin tetap bisa menimpanya sebelum menekan
 * tambah. Itu disengaja: 471 nama tidak mungkin dibereskan sempurna oleh aturan
 * mana pun, dan aturan yang memaksa akan salah pada kasus yang tidak terduga
 * tanpa ada yang bisa membetulkannya.
 */

/** Awalan penanda lini pasokan di sisi provider — tidak berarti apa pun bagi pembeli. */
const INTERNAL_PREFIXES = [/^TPG\s+/i, /^H2H\s+/i];

/** Catatan internal yang menempel di akhir nama. */
const INTERNAL_SUFFIXES = [/\s+belum\s+Admin$/i];

/**
 * Penggantian per KATA UTUH.
 *
 * Dua kelompok, dan keduanya berasal dari ketidakkonsistenan di price list itu
 * sendiri — bukan preferensi gaya:
 *
 *  - Singkatan yang datanya sendiri sudah campur aduk: Tsel 65x vs Telkomsel
 *    12x, Isat 28x vs Indosat 24x, Vcr 40x vs Voucher 124x. Dibiarkan, satu toko
 *    punya dua nama untuk operator yang sama dan pencarian pembeli meleset
 *    separuh waktu.
 *  - Salah ketik milik provider: "Fredoom" dan "Fredom" untuk "Freedom",
 *    "Sumatra" untuk "Sumatera" (17x vs 18x di data yang sama).
 */
const WORD_REPLACEMENTS: [RegExp, string][] = [
  [/\bTsel\b/gi, "Telkomsel"],
  [/\bIsat\b/gi, "Indosat"],
  [/\bVcr\b/gi, "Voucher"],
  [/\bPkt\b/gi, "Paket"],
  [/\bUnli\b/gi, "Unlimited"],
  // Empat ejaan untuk produk yang sama beredar di price list yang sama:
  // Freedom (37x, benar), Freedoom (9x), Fredom (1x), Fredoom (1x). Satu pola
  // menangkap keempatnya; yang sudah benar jadi penggantian tanpa efek.
  [/\bFre+do+m\b/gi, "Freedom"],
  [/\bSumatra\b/gi, "Sumatera"],
];

export function normalizeBrandName(brand: string): string {
  let out = brand;

  for (const prefix of INTERNAL_PREFIXES) out = out.replace(prefix, "");
  for (const suffix of INTERNAL_SUFFIXES) out = out.replace(suffix, "");
  for (const [pattern, replacement] of WORD_REPLACEMENTS) out = out.replace(pattern, replacement);

  // Tanda baca pembuka seperti "+" pada "+Masa Aktif". Hanya di AWAL: tanda
  // hubung di tengah nama sering bermakna ("XL - Axis").
  out = out.replace(/^[^\p{L}\p{N}]+/u, "");
  out = out.replace(/\s{2,}/g, " ").trim();

  // Kalau aturan di atas menyapu habis isinya, kembalikan nama aslinya. Produk
  // tanpa nama jauh lebih buruk daripada produk bernama berantakan.
  return out === "" ? brand : out;
}
