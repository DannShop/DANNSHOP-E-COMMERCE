/**
 * Pencocokan produk untuk kotak pencarian storefront.
 *
 * MURNI dan tanpa ketergantungan apa pun, dengan dua alasan yang keduanya nyata:
 *
 *  1. Repo ini belum punya perkakas tes komponen, jadi memisahkan aturan
 *     pencocokan ke sini adalah satu-satunya cara perilakunya bisa dikunci tes.
 *  2. Hari ini pencocokan dijalankan di browser — data katalog memang sudah
 *     terkirim ke sana oleh getCatalogHomeData(), jadi menanyakannya lagi ke
 *     server cuma menambah jeda pada sesuatu yang mestinya terasa seketika.
 *     Kalau katalog membesar sampai muatan halamannya tidak masuk akal lagi,
 *     fungsi ini bisa dipanggil dari server tanpa ditulis ulang.
 */

export interface SearchableProduct {
  name: string;
  publisher: string | null;
  categoryName: string;
}

/**
 * Cocok kalau SEMUA kata di kata kunci muncul di suatu tempat pada produk.
 *
 * Semua kata (AND), bukan salah satu (OR): dengan OR, mengetik "mobile legends"
 * akan memunculkan setiap produk yang sekadar memuat kata "mobile" dan justru
 * memperburuk hasil semakin panjang orang mengetik. Urutan kata sengaja
 * dibebaskan — orang sering membaliknya, dan menuntut urutan persis membuat
 * pencarian terasa rusak padahal barangnya ada.
 *
 * Nama kategori ikut dicari supaya mengetik "pulsa" memunculkan seluruh isi
 * kategori itu; sebagian orang mencari jenis barang, bukan judul produk.
 */
export function matchesProductQuery(product: SearchableProduct, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = [product.name, product.publisher ?? "", product.categoryName].join(" ").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}
