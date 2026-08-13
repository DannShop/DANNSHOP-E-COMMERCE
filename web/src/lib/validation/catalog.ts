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
  // .nullish(): checkbox tak tercentang mengirim `null` lewat formData.get(),
  // dan .optional() Zod cuma menerima `undefined` - lihat catatan lengkap di
  // actions/payment-config.ts.
  isTrending: z.string().nullish(),
  idCheckEnabled: z.string().nullish(),
  partnerVisible: z.string().nullish(),
  fulfillmentMode: z.enum(["AUTO", "MANUAL"]).default("AUTO"),
});

// Kosong -> null (bukan undefined, biar Prisma benar-benar menghapus nilai
// lama kalau flash sale item dinonaktifkan lagi - pola sama seperti
// iconUrl/banner di productSchema).
const nullableBigIntField = (message: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v === "" || v == null ? null : v))
    .transform((v, ctx) => {
      if (v === null) return null;
      try {
        const n = BigInt(v);
        if (n <= 0n) throw new Error();
        return n;
      } catch {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
    });

const nullableDateField = z
  .string()
  .optional()
  .transform((v) => (v === "" || v == null ? null : v))
  .transform((v, ctx) => {
    if (v === null) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Format tanggal tidak valid" });
      return z.NEVER;
    }
    return d;
  });

export const productItemSchema = z
  .object({
    productId: z.string().min(1),
    name: z.string().min(1, "Nama item wajib diisi"),
    sellingPrice: z.coerce.bigint().positive("Harga jual harus > 0"),
    // Nama field DB tetap `memberPrice` (mengubahnya menuntut migrasi tanpa
    // manfaat perilaku). Yang dilabeli ke admin: "Harga modal" - sejak Fase B
    // angka ini batas bawah harga, bukan harga khusus member.
    memberPrice: z.coerce.bigint().positive("Harga modal harus > 0"),
    sortOrder: z.coerce.number().int().default(0),
    // Flash sale opsional per item - kosongkan ketiganya buat menonaktifkan.
    flashPrice: nullableBigIntField("Harga flash harus > 0"),
    flashStartAt: nullableDateField,
    flashEndAt: nullableDateField,
    groupId: z.string().optional().transform((v) => (v === "" || v == null ? null : v)),
  })
  .superRefine((data, ctx) => {
    const flashFieldsFilled = [data.flashPrice, data.flashStartAt, data.flashEndAt];
    const anyFilled = flashFieldsFilled.some((v) => v !== null);
    const allFilled = flashFieldsFilled.every((v) => v !== null);
    if (anyFilled && !allFilled) {
      ctx.addIssue({
        code: "custom",
        path: ["flashPrice"],
        message: "Harga flash + jadwal mulai + jadwal selesai wajib diisi bersamaan (atau kosongkan semua).",
      });
      return;
    }
    if (data.flashPrice !== null && data.flashPrice >= data.sellingPrice) {
      ctx.addIssue({ code: "custom", path: ["flashPrice"], message: "Harga flash harus lebih murah dari harga jual." });
    }
    if (data.flashStartAt !== null && data.flashEndAt !== null && data.flashStartAt >= data.flashEndAt) {
      ctx.addIssue({ code: "custom", path: ["flashEndAt"], message: "Jadwal selesai flash sale harus setelah jadwal mulai." });
    }
  });

export const productItemGroupSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1, "Nama grup wajib diisi"),
  sortOrder: z.coerce.number().int().default(0),
});

export const bulkImportSchema = z.object({
  categoryId: z.string().min(1, "Kategori wajib dipilih"),
  provider: z.string().min(1, "Provider wajib dipilih"),
  brand: z.string().min(1, "Brand wajib dipilih"),
  slug: z.string().min(1, "Slug wajib diisi").regex(/^[a-z0-9-]+$/, "Slug hanya huruf kecil, angka, tanda hubung"),
  markupPercent: z.coerce.number().min(0, "Markup harga jual harus >= 0"),
  memberMarkupPercent: z.coerce.number().min(0, "Markup harga modal harus >= 0"),
  skuCodes: z.array(z.string().min(1)).min(1, "Pilih minimal 1 produk untuk ditambahkan"),
});
