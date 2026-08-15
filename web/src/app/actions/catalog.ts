import { revalidatePath } from "next/cache";
import { ProviderKey } from "@prisma/client";
import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productSchema, productItemSchema, productItemGroupSchema, bulkImportSchema } from "@/lib/validation/catalog";
import { applyMarkup } from "@/lib/catalog/bulk-import";
import { computeBulkMarkup } from "@/lib/catalog/bulk-markup";
import { ORDER_STATUSES_BLOCKING_DELETE, describeDeleteBlock } from "@/lib/catalog/delete-guard";
import { z } from "zod";

const MAX_BANNER_BYTES = 5 * 1024 * 1024; // 5MB — cukup besar untuk logo/banner produk, cukup kecil untuk cegah abuse storage
const ALLOWED_BANNER_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

const PROVIDER_KEYS = Object.values(ProviderKey);

function parseNonNegativeBigInt(raw: FormDataEntryValue | null): bigint | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    const value = BigInt(raw);
    return value >= BigInt(0) ? value : null;
  } catch {
    return null;
  }
}

export type ActionResult = { ok?: string; error?: string };

// Catatan: "use server" sengaja dipasang inline per-fungsi (bukan di baris pertama
// file), pola yang sama seperti actions/providers.ts — karena file ber-directive
// "use server" di level file hanya boleh meng-export async function, sementara
// ActionResult (type) harus tetap di-export dari file ini. requireAdmin/logAdmin
// didefinisikan lokal (bukan di-import dari providers.ts) karena keduanya bukan
// async function yang di-export, dan providers.ts sendiri sudah "use server" per
// fungsi sehingga tidak bisa mengekspor helper biasa untuk diimpor di sini.

async function requireAdmin(): Promise<{ adminId: string } | { error: string }> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) return { error: "Tidak diizinkan" };
  const fresh = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true, updatedAt: true } });
  if (!fresh || fresh.role !== "ADMIN" || fresh.updatedAt.getTime() !== session.user.updatedAt) {
    return { error: "Tidak diizinkan" };
  }
  return { adminId: session.user.id };
}

async function logAdmin(adminId: string, action: string, targetId: string, detail?: object) {
  await db.adminActionLog.create({
    data: { adminId, action, targetType: "product", targetId, detail },
  });
}

// Upload banner/logo produk ke Vercel Blob (public) — dipanggil terpisah dari
// createProduct/updateProduct (bukan lewat form submit utama), supaya admin
// bisa lihat hasil upload/preview sebelum benar-benar submit form produk.
// Nama file dibuat dari productId (kalau edit) atau random (kalau produk
// baru belum punya id) + addRandomSuffix, jadi tidak ada risiko tabrakan
// nama antar produk maupun antar upload ulang produk yang sama.
export async function uploadProductBanner(formData: FormData): Promise<{ url?: string; error?: string }> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "File tidak ditemukan." };
  if (!ALLOWED_BANNER_TYPES.has(file.type)) {
    return { error: "Format file harus PNG, JPEG, WebP, atau SVG." };
  }
  if (file.size > MAX_BANNER_BYTES) {
    return { error: "Ukuran file maksimal 5MB." };
  }

  const productId = formData.get("productId");
  const kind = formData.get("kind");
  const base = typeof productId === "string" && productId ? productId : "new";
  const prefix = kind === "icon" ? `${base}-icon` : base;
  const ext = file.name.split(".").pop() ?? "png";

  try {
    const blob = await put(`product-banners/${prefix}.${ext}`, file, {
      access: "public",
      addRandomSuffix: true,
    });
    return { url: blob.url };
  } catch (e) {
    console.error("uploadProductBanner gagal", { productId: prefix, error: e });
    return { error: "Gagal upload file, coba lagi." };
  }
}

export async function createProduct(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = productSchema.safeParse({
    categoryId: formData.get("categoryId"),
    slug: formData.get("slug"),
    name: formData.get("name"),
    publisher: formData.get("publisher") ?? "",
    iconUrl: formData.get("iconUrl") ?? "",
    banner: formData.get("banner") ?? "",
    description: formData.get("description") ?? "",
    inputFields: formData.get("inputFields"),
    nicknameCheckKey: formData.get("nicknameCheckKey") ?? "",
    isTrending: formData.get("isTrending"),
    idCheckEnabled: formData.get("idCheckEnabled"),
    partnerVisible: formData.get("partnerVisible"),
    fulfillmentMode: formData.get("fulfillmentMode") === "MANUAL" ? "MANUAL" : "AUTO",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const product = await db.product.create({
    data: {
      categoryId: parsed.data.categoryId,
      slug: parsed.data.slug,
      name: parsed.data.name,
      publisher: parsed.data.publisher,
      iconUrl: parsed.data.iconUrl,
      banner: parsed.data.banner,
      description: parsed.data.description,
      inputFields: parsed.data.inputFields,
      nicknameCheckKey: parsed.data.nicknameCheckKey,
      idCheckEnabled: parsed.data.idCheckEnabled === "on",
      fulfillmentMode: parsed.data.fulfillmentMode,
      isTrending: parsed.data.isTrending === "on",
      // Checkbox tak tercentang = tidak dikirim sama sekali, jadi ini benar-benar
      // berarti "admin mencentang untuk membukanya ke mitra". Form memberi
      // defaultChecked=true untuk produk baru supaya cocok dengan default kolomnya.
      partnerVisible: parsed.data.partnerVisible === "on",
      isActive: false,
    },
  });
  await logAdmin(admin.adminId, "catalog.create_product", product.id, { slug: product.slug });
  revalidatePath("/admin/products");
  return { ok: "Produk dibuat. Aktifkan setelah menambah item." };
}

export async function updateProduct(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Produk tidak ditemukan." };

  const parsed = productSchema.safeParse({
    categoryId: formData.get("categoryId"),
    slug: formData.get("slug"),
    name: formData.get("name"),
    publisher: formData.get("publisher") ?? "",
    iconUrl: formData.get("iconUrl") ?? "",
    banner: formData.get("banner") ?? "",
    description: formData.get("description") ?? "",
    inputFields: formData.get("inputFields"),
    nicknameCheckKey: formData.get("nicknameCheckKey") ?? "",
    isTrending: formData.get("isTrending"),
    idCheckEnabled: formData.get("idCheckEnabled"),
    partnerVisible: formData.get("partnerVisible"),
    fulfillmentMode: formData.get("fulfillmentMode") === "MANUAL" ? "MANUAL" : "AUTO",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.product.update({
    where: { id },
    data: {
      categoryId: parsed.data.categoryId,
      slug: parsed.data.slug,
      name: parsed.data.name,
      publisher: parsed.data.publisher,
      iconUrl: parsed.data.iconUrl,
      banner: parsed.data.banner,
      description: parsed.data.description,
      inputFields: parsed.data.inputFields,
      nicknameCheckKey: parsed.data.nicknameCheckKey,
      idCheckEnabled: parsed.data.idCheckEnabled === "on",
      fulfillmentMode: parsed.data.fulfillmentMode,
      isTrending: parsed.data.isTrending === "on",
      // Checkbox tak tercentang = tidak dikirim sama sekali, jadi ini benar-benar
      // berarti "admin mencentang untuk membukanya ke mitra". Form memberi
      // defaultChecked=true untuk produk baru supaya cocok dengan default kolomnya.
      partnerVisible: parsed.data.partnerVisible === "on",
    },
  });
  await logAdmin(admin.adminId, "catalog.update_product", id);
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${id}`);
  return { ok: "Produk tersimpan." };
}

export async function toggleProductActive(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Produk tidak ditemukan." };

  const product = await db.product.findUnique({
    where: { id },
    include: { _count: { select: { items: true } } },
  });
  if (!product) return { error: "Produk tidak ditemukan." };
  if (!product.isActive && product._count.items === 0) {
    return { error: "Produk belum punya item — tambahkan minimal satu item dulu sebelum diaktifkan." };
  }

  await db.product.update({ where: { id }, data: { isActive: !product.isActive } });
  await logAdmin(admin.adminId, product.isActive ? "catalog.deactivate_product" : "catalog.activate_product", id);
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${id}`);
  return { ok: `Produk ${product.isActive ? "dinonaktifkan" : "diaktifkan"}.` };
}

export async function createProductItem(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = productItemSchema.safeParse({
    productId: formData.get("productId"),
    name: formData.get("name"),
    sellingPrice: formData.get("sellingPrice"),
    memberPrice: formData.get("memberPrice"),
    sortOrder: formData.get("sortOrder") ?? 0,
    flashPrice: formData.get("flashPrice") ?? "",
    flashStartAt: formData.get("flashStartAt") ?? "",
    flashEndAt: formData.get("flashEndAt") ?? "",
    groupId: formData.get("groupId") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const item = await db.productItem.create({
    data: {
      productId: parsed.data.productId,
      name: parsed.data.name,
      sellingPrice: parsed.data.sellingPrice,
      memberPrice: parsed.data.memberPrice,
      sortOrder: parsed.data.sortOrder,
      isActive: formData.get("isActive") === "on",
      flashPrice: parsed.data.flashPrice,
      flashStartAt: parsed.data.flashStartAt,
      flashEndAt: parsed.data.flashEndAt,
      groupId: parsed.data.groupId,
    },
  });
  await logAdmin(admin.adminId, "catalog.create_item", item.id, { productId: parsed.data.productId });
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${parsed.data.productId}`);
  return { ok: "Item ditambahkan." };
}

export async function updateProductItem(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Item tidak ditemukan." };

  const parsed = productItemSchema.safeParse({
    productId: formData.get("productId"),
    name: formData.get("name"),
    sellingPrice: formData.get("sellingPrice"),
    memberPrice: formData.get("memberPrice"),
    sortOrder: formData.get("sortOrder") ?? 0,
    flashPrice: formData.get("flashPrice") ?? "",
    flashStartAt: formData.get("flashStartAt") ?? "",
    flashEndAt: formData.get("flashEndAt") ?? "",
    groupId: formData.get("groupId") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.productItem.update({
    where: { id },
    data: {
      name: parsed.data.name,
      sellingPrice: parsed.data.sellingPrice,
      memberPrice: parsed.data.memberPrice,
      sortOrder: parsed.data.sortOrder,
      isActive: formData.get("isActive") === "on",
      flashPrice: parsed.data.flashPrice,
      flashStartAt: parsed.data.flashStartAt,
      flashEndAt: parsed.data.flashEndAt,
      groupId: parsed.data.groupId,
    },
  });
  await logAdmin(admin.adminId, "catalog.update_item", id);
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${parsed.data.productId}`);
  return { ok: "Item tersimpan." };
}

export async function createProductItemGroup(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = productItemGroupSchema.safeParse({
    productId: formData.get("productId"),
    name: formData.get("name"),
    sortOrder: formData.get("sortOrder") ?? 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const group = await db.productItemGroup.create({ data: parsed.data });
  await logAdmin(admin.adminId, "catalog.create_item_group", group.id, { productId: parsed.data.productId });
  revalidatePath(`/admin/products/${parsed.data.productId}`);
  revalidatePath("/");
  return { ok: "Grup dibuat." };
}

export async function updateProductItemGroup(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Grup tidak ditemukan." };

  const parsed = productItemGroupSchema.safeParse({
    productId: formData.get("productId"),
    name: formData.get("name"),
    sortOrder: formData.get("sortOrder") ?? 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.productItemGroup.update({
    where: { id },
    data: { name: parsed.data.name, sortOrder: parsed.data.sortOrder },
  });
  await logAdmin(admin.adminId, "catalog.update_item_group", id);
  revalidatePath(`/admin/products/${parsed.data.productId}`);
  revalidatePath("/");
  return { ok: "Grup tersimpan." };
}

// Hapus grup TIDAK menghapus item di dalamnya - relasi ProductItem.groupId
// di-set SetNull di schema, jadi item otomatis balik jadi "tanpa grup" di
// level database begitu grup induknya dihapus, tidak pernah ikut terhapus.
export async function deleteProductItemGroup(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const id = formData.get("id");
  const productId = formData.get("productId");
  if (typeof id !== "string" || !id) return { error: "Grup tidak ditemukan." };
  if (typeof productId !== "string" || !productId) return { error: "Produk tidak ditemukan." };

  await db.productItemGroup.delete({ where: { id } });
  await logAdmin(admin.adminId, "catalog.delete_item_group", id);
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/");
  return { ok: "Grup dihapus, item di dalamnya jadi tanpa grup." };
}

/**
 * Order belum tuntas yang menghalangi penghapusan item-item ini.
 *
 * `Order.productItemId` SENGAJA tidak punya relasi Prisma (lihat schema), jadi
 * database tidak akan menghentikan apa pun — tidak ada foreign key yang menjaga
 * ini. Penjaganya harus di sini, dan kalau lupa dipanggil, tidak ada satu pun
 * lapisan di bawah yang menangkapnya.
 */
async function findBlockingOrders(productItemIds: string[]) {
  if (productItemIds.length === 0) return [];
  return db.order.findMany({
    where: {
      productItemId: { in: productItemIds },
      status: { in: ORDER_STATUSES_BLOCKING_DELETE },
    },
    select: { orderNumber: true, status: true },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Buang item beserta seluruh mapping providernya, dalam SATU transaksi.
 *
 * Urutannya wajib: `ProviderSku.productItemId` merujuk ProductItem tanpa
 * `onDelete`, jadi bawaannya Restrict — menghapus item lebih dulu langsung
 * ditolak database. Dan keduanya harus satu transaksi: kalau mapping terhapus
 * lalu penghapusan itemnya gagal, yang tersisa adalah item tanpa provider —
 * tampak sehat di layar admin, tapi setiap order ke item itu gagal.
 */
async function deleteItemsCascade(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], itemIds: string[]) {
  await tx.providerSku.deleteMany({ where: { productItemId: { in: itemIds } } });
  await tx.productItem.deleteMany({ where: { id: { in: itemIds } } });
}

export async function deleteProductItem(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Item tidak ditemukan." };

  const item = await db.productItem.findUnique({ where: { id }, select: { productId: true, name: true } });
  if (!item) return { error: "Item tidak ditemukan." };

  const blocked = describeDeleteBlock(await findBlockingOrders([id]));
  if (blocked) return { error: blocked };

  await db.$transaction((tx) => deleteItemsCascade(tx, [id]));
  await logAdmin(admin.adminId, "catalog.delete_item", id, { name: item.name });
  revalidatePath(`/admin/products/${item.productId}`);
  revalidatePath("/admin/products");
  revalidatePath("/");
  return { ok: `Item "${item.name}" dihapus.` };
}

export async function deleteProductItems(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const productId = formData.get("productId");
  const ids = formData.getAll("itemIds").filter((v): v is string => typeof v === "string" && v !== "");
  if (typeof productId !== "string" || !productId) return { error: "Produk tidak ditemukan." };
  if (ids.length === 0) return { error: "Belum ada item yang dipilih." };

  // Dibatasi ke item milik produk ini. Tanpa ini, id dari produk lain yang
  // diselipkan ke form akan ikut terhapus — halaman ini tidak pernah bermaksud
  // menyentuh produk lain.
  const owned = await db.productItem.findMany({
    where: { id: { in: ids }, productId },
    select: { id: true },
  });
  if (owned.length === 0) return { error: "Item yang dipilih tidak ditemukan di produk ini." };
  const ownedIds = owned.map((i) => i.id);

  // SEMUA atau TIDAK SAMA SEKALI. Menghapus sebagian lalu melapor "3 dari 5
  // terhapus" meninggalkan admin dengan pekerjaan setengah jadi yang harus
  // dibereskan manual; lebih baik tidak menyentuh apa pun dan menyebut yang
  // menghalangi.
  const blocked = describeDeleteBlock(await findBlockingOrders(ownedIds));
  if (blocked) return { error: blocked };

  await db.$transaction((tx) => deleteItemsCascade(tx, ownedIds));
  await logAdmin(admin.adminId, "catalog.delete_items", productId, { count: ownedIds.length });
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/products");
  revalidatePath("/");
  return { ok: `${ownedIds.length} item dihapus.` };
}

/**
 * Hapus produk beserta seluruh isinya.
 *
 * Riwayat order TIDAK ikut hilang: Order menyimpan snapshot productName,
 * itemName, sellingPrice, dan fulfillmentMode, jadi halaman order & invoice lama
 * tetap terbaca utuh. Yang tersisa cuma `Order.productItemId` yang menggantung —
 * tanpa foreign key, dan satu-satunya pembacanya adalah field `sku` di respons
 * status API partner.
 */
export async function deleteProduct(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Produk tidak ditemukan." };

  const product = await db.product.findUnique({
    where: { id },
    select: { name: true, items: { select: { id: true } } },
  });
  if (!product) return { error: "Produk tidak ditemukan." };

  const itemIds = product.items.map((i) => i.id);
  const blocked = describeDeleteBlock(await findBlockingOrders(itemIds));
  if (blocked) return { error: blocked };

  await db.$transaction(async (tx) => {
    await deleteItemsCascade(tx, itemIds);
    // Grup dihapus SETELAH itemnya. Kebalikannya tidak salah secara data
    // (ProductItem.groupId memakai onDelete: SetNull) tapi memaksa database
    // menulis ulang baris yang sebentar lagi dihapus.
    await tx.productItemGroup.deleteMany({ where: { productId: id } });
    await tx.product.delete({ where: { id } });
  });

  await logAdmin(admin.adminId, "catalog.delete_product", id, { name: product.name, items: itemIds.length });
  revalidatePath("/admin/products");
  revalidatePath("/");
  return { ok: `Produk "${product.name}" beserta ${itemIds.length} itemnya dihapus.` };
}

const bulkMarkupInputSchema = z.object({
  categoryId: z.string().optional().transform((v) => (v ? v : null)),
  sellingMarkupPercent: z.coerce.number().min(0, "Markup harga jual harus >= 0"),
  memberMarkupPercent: z.coerce.number().min(0, "Markup harga modal harus >= 0"),
});

export interface MarkupPreviewRowSerialized {
  itemId: string;
  productName: string;
  itemName: string;
  costPrice: string;
  oldSellingPrice: string;
  newSellingPrice: string;
  oldMemberPrice: string;
  newMemberPrice: string;
  skipped: boolean;
  skipReason?: string;
}

export async function previewBulkMarkup(
  formData: FormData,
): Promise<{ rows?: MarkupPreviewRowSerialized[]; error?: string }> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = bulkMarkupInputSchema.safeParse({
    categoryId: formData.get("categoryId"),
    sellingMarkupPercent: formData.get("sellingMarkupPercent"),
    memberMarkupPercent: formData.get("memberMarkupPercent"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const rows = await computeBulkMarkup(
    parsed.data.categoryId,
    parsed.data.sellingMarkupPercent,
    parsed.data.memberMarkupPercent,
  );
  // bigint diserialisasi jadi string sebelum melewati batas server
  // action -> client component, pola yang sama dipakai di seluruh admin/.
  return {
    rows: rows.map((r) => ({
      ...r,
      costPrice: r.costPrice.toString(),
      oldSellingPrice: r.oldSellingPrice.toString(),
      newSellingPrice: r.newSellingPrice.toString(),
      oldMemberPrice: r.oldMemberPrice.toString(),
      newMemberPrice: r.newMemberPrice.toString(),
    })),
  };
}

// Menghitung ULANG dari DB fresh (tidak pernah percaya angka preview yang
// dikirim balik dari client) - kalau ada perubahan data di antara preview
// dan klik "Terapkan", yang benar-benar diterapkan adalah angka saat ini,
// bukan angka basi dari preview sebelumnya.
export async function applyBulkMarkup(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = bulkMarkupInputSchema.safeParse({
    categoryId: formData.get("categoryId"),
    sellingMarkupPercent: formData.get("sellingMarkupPercent"),
    memberMarkupPercent: formData.get("memberMarkupPercent"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const rows = await computeBulkMarkup(
    parsed.data.categoryId,
    parsed.data.sellingMarkupPercent,
    parsed.data.memberMarkupPercent,
  );
  const toApply = rows.filter((r) => !r.skipped);
  if (toApply.length === 0) {
    return { error: "Tidak ada item yang bisa diterapkan (semua dilewati atau tidak ada item cocok)." };
  }

  await db.$transaction(
    toApply.map((r) =>
      db.productItem.update({
        where: { id: r.itemId },
        data: { sellingPrice: r.newSellingPrice, memberPrice: r.newMemberPrice },
      }),
    ),
  );
  await logAdmin(admin.adminId, "catalog.apply_bulk_markup", parsed.data.categoryId ?? "all", {
    sellingMarkupPercent: parsed.data.sellingMarkupPercent,
    memberMarkupPercent: parsed.data.memberMarkupPercent,
    itemCount: toApply.length,
    skippedCount: rows.length - toApply.length,
  });
  revalidatePath("/admin/products");
  revalidatePath("/admin/markup");
  revalidatePath("/");
  const skippedCount = rows.length - toApply.length;
  return {
    ok: `${toApply.length} item diperbarui.${skippedCount > 0 ? ` ${skippedCount} item dilewati karena bentrok flash sale.` : ""}`,
  };
}

// Petakan satu ProductItem ke SKU sebuah provider. Upsert on
// @@unique([productItemId, provider]) — satu item boleh punya paling banyak
// satu mapping aktif per provider (ganti kode/harga = replace mapping lama).
// Sync harga (Task 7) hanya MENGUBAH mapping yang sudah ada lewat aksi ini,
// tidak pernah membuat baru — sesuai kontrak diffPriceList di price-sync.ts.
export async function mapProviderSku(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const productItemId = formData.get("productItemId");
  const provider = formData.get("provider");
  const providerSkuCode = formData.get("providerSkuCode");
  const costPriceRaw = formData.get("costPrice");

  if (typeof productItemId !== "string" || !productItemId) return { error: "Item produk tidak ditemukan." };
  if (typeof provider !== "string" || !PROVIDER_KEYS.includes(provider as ProviderKey)) {
    return { error: "Provider tidak valid." };
  }
  if (typeof providerSkuCode !== "string" || !providerSkuCode.trim()) {
    return { error: "Kode SKU provider wajib diisi." };
  }

  const costPrice = parseNonNegativeBigInt(costPriceRaw);
  if (costPrice === null) return { error: "Harga modal tidak valid." };

  const item = await db.productItem.findUnique({ where: { id: productItemId }, select: { productId: true } });
  if (!item) return { error: "Item produk tidak ditemukan." };

  const providerKey = provider as ProviderKey;
  const code = providerSkuCode.trim();
  const mapping = await db.providerSku.upsert({
    where: { productItemId_provider: { productItemId, provider: providerKey } },
    create: {
      productItemId,
      provider: providerKey,
      providerSkuCode: code,
      costPrice,
      status: "ACTIVE",
      lastSyncedAt: new Date(),
    },
    update: {
      providerSkuCode: code,
      costPrice,
      status: "ACTIVE",
      lastSyncedAt: new Date(),
    },
  });

  await logAdmin(admin.adminId, "catalog.map_sku", productItemId, {
    provider: providerKey,
    providerSkuCode: code,
    costPrice: costPrice.toString(),
    mappingId: mapping.id,
  });
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${item.productId}`);
  return { ok: "SKU berhasil dipetakan." };
}

// Tetapkan satu mapping sebagai provider UTAMA untuk item ini; sisanya jadi cadangan.
//
// Kenapa satu aksi yang mengubah SEMUA baris, bukan field angka `priority` yang
// bisa diketik bebas per baris: priority yang diisi manual gampang berakhir seri
// (dua-duanya 1) atau terbalik tanpa disadari, dan akibatnya baru ketahuan saat
// order sudah terlanjur lari ke provider yang salah. Dengan bentuk ini, keadaan
// "tepat satu utama" dijaga oleh aksinya sendiri, bukan oleh kedisiplinan admin.
//
// Dijalankan dalam satu transaksi supaya tidak pernah ada jeda di mana item punya
// dua provider utama atau tidak punya satu pun.
export async function setPrimaryProviderSku(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Mapping tidak ditemukan." };

  const mapping = await db.providerSku.findUnique({
    where: { id },
    select: {
      productItemId: true,
      provider: true,
      productItem: { select: { productId: true } },
    },
  });
  if (!mapping) return { error: "Mapping tidak ditemukan." };

  await db.$transaction([
    // Semua mapping item ini diturunkan dulu...
    db.providerSku.updateMany({
      where: { productItemId: mapping.productItemId },
      data: { priority: 2 },
    }),
    // ...lalu yang dipilih dinaikkan. Urutan ini penting: kebalikannya akan
    // menurunkan lagi baris yang baru saja dijadikan utama.
    db.providerSku.update({ where: { id }, data: { priority: 1 } }),
  ]);

  await logAdmin(admin.adminId, "catalog.set_primary_sku", mapping.productItemId, {
    provider: mapping.provider,
  });
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${mapping.productItem.productId}`);
  return { ok: `${mapping.provider} dijadikan provider utama untuk item ini.` };
}

export async function unmapProviderSku(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Mapping tidak ditemukan." };

  const mapping = await db.providerSku.findUnique({
    where: { id },
    select: {
      productItemId: true,
      provider: true,
      providerSkuCode: true,
      productItem: { select: { productId: true } },
    },
  });
  if (!mapping) return { error: "Mapping tidak ditemukan." };

  await db.providerSku.delete({ where: { id } });
  await logAdmin(admin.adminId, "catalog.unmap_sku", mapping.productItemId, {
    provider: mapping.provider,
    providerSkuCode: mapping.providerSkuCode,
  });
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${mapping.productItem.productId}`);
  return { ok: "Mapping SKU dihapus." };
}

// Bulk-add: satu brand Digiflazz (mis. "Mobile Legends") -> satu Product kita,
// tiap baris price-list yang dicentang admin -> satu ProductItem + mapping
// ProviderSku baru. Harga jual/member SELALU dihitung ulang di server dari
// costPrice yang dibaca fresh dari ProviderPriceListCache (skuCodes) — bukan
// dari costPrice yang (mungkin) dikirim balik lewat form — supaya harga yang
// akhirnya dibayar customer tidak pernah bisa dipengaruhi payload klien.
// Idempotent by design: SKU yang providerSku-nya sudah pernah dipetakan
// (created di run sebelumnya) DILEWATI, tidak di-reprice — biar tidak
// menimpa harga yang mungkin sudah diedit manual admin setelah import
// pertama. Re-price SKU lama tetap lewat "Sync Harga" (runPriceSync) yang
// sudah ada, bukan tanggung jawab bulk-import.
export async function bulkImportProducts(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = bulkImportSchema.safeParse({
    categoryId: formData.get("categoryId"),
    provider: formData.get("provider"),
    brand: formData.get("brand"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    markupPercent: formData.get("markupPercent"),
    memberMarkupPercent: formData.get("memberMarkupPercent"),
    skuCodes: formData.getAll("skuCodes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (!PROVIDER_KEYS.includes(parsed.data.provider as ProviderKey)) {
    return { error: "Provider tidak valid." };
  }
  const providerKey = parsed.data.provider as ProviderKey;

  const category = await db.category.findUnique({ where: { id: parsed.data.categoryId } });
  if (!category) return { error: "Kategori tidak ditemukan." };

  const rows = await db.providerPriceListCache.findMany({
    where: {
      provider: providerKey,
      brand: parsed.data.brand,
      skuCode: { in: parsed.data.skuCodes },
    },
  });
  if (rows.length === 0) {
    return { error: "Data price-list tidak ditemukan lagi di cache — coba sync harga ulang lalu cari ulang." };
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const product = await tx.product.upsert({
        where: { slug: parsed.data.slug },
        update: {},
        create: {
          categoryId: parsed.data.categoryId,
          slug: parsed.data.slug,
          // Nama TAMPILAN, bukan nama brand mentah. Nama brand provider sering
          // memuat awalan pemasok & singkatan yang tidak berarti bagi pembeli
          // (lihat lib/catalog/brand-name.ts) - dan nama inilah judul yang
          // dilihat orang di katalog.
          name: parsed.data.name,
          inputFields: [{ name: "user_id", label: "ID Tujuan" }],
          isActive: false,
        },
      });

      let created = 0;
      let skipped = 0;
      for (const row of rows) {
        const already = await tx.providerSku.findFirst({
          where: { provider: providerKey, providerSkuCode: row.skuCode },
        });
        if (already) {
          skipped++;
          continue;
        }

        const item = await tx.productItem.create({
          data: {
            productId: product.id,
            name: row.productName,
            sellingPrice: applyMarkup(row.costPrice, parsed.data.markupPercent),
            memberPrice: applyMarkup(row.costPrice, parsed.data.memberMarkupPercent),
            sortOrder: 0,
            isActive: row.available,
          },
        });
        await tx.providerSku.create({
          data: {
            productItemId: item.id,
            provider: providerKey,
            providerSkuCode: row.skuCode,
            costPrice: row.costPrice,
            status: row.available ? "ACTIVE" : "UNAVAILABLE",
            lastSyncedAt: new Date(),
          },
        });
        created++;
      }

      return { productId: product.id, created, skipped };
    });

    await logAdmin(admin.adminId, "catalog.bulk_import", result.productId, {
      brand: parsed.data.brand,
      provider: providerKey,
      created: result.created,
      skipped: result.skipped,
    });
    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${result.productId}`);

    if (result.created === 0) {
      return { ok: `Semua ${result.skipped} item yang dicentang sudah pernah diimpor sebelumnya — tidak ada yang baru ditambahkan.` };
    }
    return {
      ok: `${result.created} item baru ditambahkan ke produk "${parsed.data.brand}"${result.skipped > 0 ? ` (${result.skipped} item dilewati karena sudah pernah diimpor)` : ""}. Buka halaman produk untuk cek harga lalu aktifkan.`,
    };
  } catch (e) {
    console.error("bulkImportProducts gagal", { brand: parsed.data.brand, error: e });
    return { error: e instanceof Error ? e.message : "Gagal bulk-import, coba lagi." };
  }
}
