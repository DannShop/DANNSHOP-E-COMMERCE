import { z } from "zod";

export const productSchema = z.object({
  categoryId: z.string().min(1, "Kategori wajib dipilih"),
  slug: z.string().min(1, "Slug wajib diisi").regex(/^[a-z0-9-]+$/, "Slug hanya huruf kecil, angka, tanda hubung"),
  name: z.string().min(1, "Nama wajib diisi"),
  publisher: z.string().optional().transform((v) => (v === "" ? undefined : v)),
  // iconUrl/banner dipetakan ke null (bukan undefined) saat kosong: undefined
  // bikin Prisma melewati kolomnya, sehingga tombol "Hapus" di form tidak
  // pernah benar-benar menghapus gambar yang sudah tersimpan.
  iconUrl: z.string().optional().transform((v) => (v === "" || v == null ? null : v)),
  banner: z.string().optional().transform((v) => (v === "" || v == null ? null : v)),
  description: z.string().optional().transform((v) => (v === "" ? undefined : v)),
  // inputFields dikirim sebagai JSON string dari textarea admin
  inputFields: z.string().transform((v, ctx) => {
    try {
      const parsed = JSON.parse(v);
      if (!Array.isArray(parsed)) throw new Error();
      return parsed as { name: string; label: string }[];
    } catch {
      ctx.addIssue({ code: "custom", message: "inputFields harus JSON array, contoh: [{\"name\":\"user_id\",\"label\":\"User ID\"}]" });
      return z.NEVER;
    }
  }),
  nicknameCheckKey: z.string().optional().transform((v) => (v === "" ? undefined : v)),
  isTrending: z.string().optional(),
});

export const productItemSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1, "Nama item wajib diisi"),
  sellingPrice: z.coerce.bigint().positive("Harga jual harus > 0"),
  memberPrice: z.coerce.bigint().positive("Harga member harus > 0"),
  sortOrder: z.coerce.number().int().default(0),
});

export const bulkImportSchema = z.object({
  categoryId: z.string().min(1, "Kategori wajib dipilih"),
  provider: z.string().min(1, "Provider wajib dipilih"),
  brand: z.string().min(1, "Brand wajib dipilih"),
  slug: z.string().min(1, "Slug wajib diisi").regex(/^[a-z0-9-]+$/, "Slug hanya huruf kecil, angka, tanda hubung"),
  markupPercent: z.coerce.number().min(0, "Markup harga jual harus >= 0"),
  memberMarkupPercent: z.coerce.number().min(0, "Markup harga member harus >= 0"),
  skuCodes: z.array(z.string().min(1)).min(1, "Pilih minimal 1 produk untuk ditambahkan"),
});
