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
      providerSkus: { where: { provider: "DIGIFLAZZ", status: "ACTIVE" } },
    },
  });

  return items
    .filter((item) => item.providerSkus.length > 0)
    .map((item) => {
      const costPrice = item.providerSkus[0].costPrice;
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
