import { db } from "@/lib/db";
import { applyMarkup } from "@/lib/catalog/bulk-import";

export interface MarkupPreviewRow {
  itemId: string;
  productName: string;
  itemName: string;
  costPrice: bigint;
  oldSellingPrice: bigint;
  newSellingPrice: bigint;
  oldMemberPrice: bigint;
  newMemberPrice: bigint;
  skipped: boolean;
  skipReason?: string;
}

/**
 * Modal mana yang jadi dasar markup ketika satu item punya beberapa provider.
 *
 * Ambil yang TERMAHAL, dan arah itu menentukan uang: markup dari modal termurah
 * bisa menghasilkan harga jual yang berada di bawah modal provider LAIN di item
 * yang sama. Begitu provider murah gagal dan order jatuh ke cadangan, guard
 * anti-jual-rugi di selectFulfillmentSku menolaknya (`price_increased`) dan
 * ordernya gagal - padahal seluruh mapping-nya tampak sehat. Dari yang termahal,
 * semua provider di item itu tetap untung.
 *
 * Sikap yang sama dipakai dedupePriceList saat memilih di antara baris kembar.
 *
 * Catatan: SKU dari provider yang sedang dimatikan admin ikut terhitung. Itu
 * disengaja - kill-switch bersifat sementara, dan menurunkan harga jual selama
 * provider mahal dimatikan berarti harganya harus dinaikkan lagi diam-diam saat
 * provider itu dinyalakan kembali.
 */
export function markupBasisCost(skus: { costPrice: bigint }[]): bigint | null {
  if (skus.length === 0) return null;
  return skus.reduce((max, s) => (s.costPrice > max ? s.costPrice : max), skus[0].costPrice);
}

// Dipakai preview DAN apply - keduanya harus menghitung baris yang identik
// persis, supaya apa yang di-apply selalu sama dengan apa yang sudah dilihat
// admin di preview (apply menghitung ulang dari DB fresh, tidak pernah
// percaya angka yang dikirim balik dari client).
export async function computeBulkMarkup(
  categoryId: string | null,
  sellingMarkupPercent: number,
  memberMarkupPercent: number,
): Promise<MarkupPreviewRow[]> {
  const items = await db.productItem.findMany({
    where: {
      isActive: true,
      product: categoryId ? { categoryId, isActive: true } : { isActive: true },
    },
    include: {
      product: { select: { name: true } },
      // Provider-agnostic. Sebelumnya disaring `provider: "DIGIFLAZZ"`, sisa dari
      // masa satu provider — akibatnya item yang cuma dipetakan ke OkeConnect punya
      // nol SKU di sini, tersapu oleh filter di bawah, dan DILEWATI markup massal
      // tanpa satu pun keterangan. Admin menjalankan markup untuk satu kategori,
      // preview-nya kosong, dan tidak ada yang menjelaskan kenapa.
      providerSkus: { where: { status: "ACTIVE" }, select: { costPrice: true } },
    },
  });

  return items
    .map((item) => ({ item, costPrice: markupBasisCost(item.providerSkus) }))
    .filter((row): row is { item: (typeof items)[number]; costPrice: bigint } => row.costPrice !== null)
    .map(({ item, costPrice }) => {
      const newSellingPrice = applyMarkup(costPrice, sellingMarkupPercent);
      const newMemberPrice = applyMarkup(costPrice, memberMarkupPercent);
      // Item dengan flash sale aktif/terjadwal dilewati kalau harga jual baru
      // bikin flashPrice tidak lagi lebih murah - jangan pernah diam-diam
      // menghapus/mengubah flash sale yang sudah admin atur lewat operasi massal.
      const flashConflict = item.flashPrice !== null && item.flashPrice >= newSellingPrice;
      return {
        itemId: item.id,
        productName: item.product.name,
        itemName: item.name,
        costPrice,
        oldSellingPrice: item.sellingPrice,
        newSellingPrice,
        oldMemberPrice: item.memberPrice,
        newMemberPrice,
        skipped: flashConflict,
        skipReason: flashConflict ? "Bentrok flash sale aktif (harga flash >= harga jual baru)" : undefined,
      };
    });
}
