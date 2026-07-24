import { z } from "zod";

export const productSchema = z.object({
  categoryId: z.string().min(1, "Kategori wajib dipilih"),
  slug: z.string().min(1, "Slug wajib diisi").regex(/^[a-z0-9-]+$/, "Slug hanya huruf kecil, angka, tanda hubung"),
  name: z.string().min(1, "Nama wajib diisi"),
  publisher: z.string().optional().transform((v) => (v === "" ? undefined : v)),
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
});

export const productItemSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1, "Nama item wajib diisi"),
  sellingPrice: z.coerce.bigint().positive("Harga jual harus > 0"),
  memberPrice: z.coerce.bigint().positive("Harga member harus > 0"),
  sortOrder: z.coerce.number().int().default(0),
});
