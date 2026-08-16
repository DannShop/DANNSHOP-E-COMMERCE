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
  // inputFields dikirim sebagai JSON string dari form admin (disusun oleh
  // InputFieldsBuilder, bukan lagi diketik tangan).
  //
  // Isinya divalidasi per-baris, bukan cuma "harus array": `name` dipakai sebagai
  // nama field di form pembeli DAN kunci di Order.target, dan checkout.ts menolak
  // order kalau field wajibnya kosong. Satu baris cacat (nama kosong, bukan
  // string, nama kembar) membuat produknya TIDAK BISA dibeli sama sekali — dan
  // gejalanya muncul di halaman pembeli, jauh dari tempat kesalahannya dibuat.
  inputFields: z.string().transform((v, ctx) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(v);
    } catch {
      ctx.addIssue({ code: "custom", message: "Daftar field tujuan tidak terbaca. Muat ulang halaman lalu susun ulang." });
      return z.NEVER;
    }
    if (!Array.isArray(parsed)) {
      ctx.addIssue({ code: "custom", message: "Daftar field tujuan harus berupa daftar." });
      return z.NEVER;
    }

    const out: { name: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const row of parsed) {
      if (row === null || typeof row !== "object") {
        ctx.addIssue({ code: "custom", message: "Ada field tujuan yang bentuknya tidak dikenali." });
        return z.NEVER;
      }
      const { name, label } = row as { name?: unknown; label?: unknown };
      if (typeof name !== "string" || typeof label !== "string") {
        ctx.addIssue({ code: "custom", message: "Setiap field tujuan harus punya nama teknis dan label." });
        return z.NEVER;
      }
      const trimmedName = name.trim();
      const trimmedLabel = label.trim();
      if (!trimmedName || !trimmedLabel) {
        ctx.addIssue({ code: "custom", message: "Nama teknis dan label field tujuan tidak boleh kosong." });
        return z.NEVER;
      }
      // Dikunci ke [a-z0-9_]: karakter lain (spasi, titik, tanda kurung) membuat
      // nama di formData tidak lagi cocok dengan definisinya, sehingga field yang
      // WAJIB diisi justru selalu terbaca kosong saat checkout.
      if (!/^[a-z0-9_]+$/.test(trimmedName)) {
        ctx.addIssue({
          code: "custom",
          message: `Nama teknis "${trimmedName}" hanya boleh huruf kecil, angka, dan garis bawah.`,
        });
        return z.NEVER;
      }
      if (seen.has(trimmedName)) {
        // Nama kembar berarti satu field menimpa nilai field lain di Order.target —
        // nomor tujuan yang terkirim ke provider jadi salah tanpa error apa pun.
        ctx.addIssue({ code: "custom", message: `Nama teknis "${trimmedName}" dipakai lebih dari sekali.` });
        return z.NEVER;
      }
      seen.add(trimmedName);
      out.push({ name: trimmedName, label: trimmedLabel });
    }
    return out;
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

// Teks opsional: kosong berarti "tidak diisi" (null), BUKAN string kosong.
// Dibedakan supaya tampilan bisa memakai `?? null` tanpa harus ikut menebak
// apakah "" berarti dihapus atau tidak pernah ada.
const nullableTextField = (max: number, message: string) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const trimmed = (v ?? "").trim();
      return trimmed === "" ? null : trimmed;
    })
    .refine((v) => v === null || v.length <= max, { message });

// Stok opsional. KOSONG = tak terbatas (null), dan itu berbeda dari 0 yang
// berarti habis - keduanya harus bisa dinyatakan, jadi field ini tidak boleh
// dipangkas jadi angka biasa berdefault 0.
const nullableStockField = z
  .string()
  .optional()
  .transform((v) => (v === "" || v == null ? null : v))
  .transform((v, ctx) => {
    if (v === null) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: "Stok harus bilangan bulat 0 atau lebih (kosongkan = tak terbatas)" });
      return z.NEVER;
    }
    return n;
  });

export const productItemSchema = z
  .object({
    productId: z.string().min(1),
    name: z.string().min(1, "Nama item wajib diisi"),
    description: nullableTextField(500, "Deskripsi item maksimal 500 karakter"),
    manualSkuCode: nullableTextField(64, "Kode SKU maksimal 64 karakter"),
    stock: nullableStockField,
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
  // Nama yang DIPAJANG ke pembeli. Terpisah dari `brand`, yang tetap dipakai
  // sebagai kunci pencocokan ke price list provider — mengganti nama tampilan
  // tidak boleh memutus hubungan ke SKU-nya.
  name: z.string().min(1, "Nama produk wajib diisi").max(191, "Nama produk terlalu panjang"),
  slug: z.string().min(1, "Slug wajib diisi").regex(/^[a-z0-9-]+$/, "Slug hanya huruf kecil, angka, tanda hubung"),
  markupPercent: z.coerce.number().min(0, "Markup harga jual harus >= 0"),
  memberMarkupPercent: z.coerce.number().min(0, "Markup harga modal harus >= 0"),
  skuCodes: z.array(z.string().min(1)).min(1, "Pilih minimal 1 produk untuk ditambahkan"),
});
