import { revalidatePath } from "next/cache";
import { ProviderKey } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productSchema, productItemSchema } from "@/lib/validation/catalog";

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
  return { adminId: session.user.id };
}

async function logAdmin(adminId: string, action: string, targetId: string, detail?: object) {
  await db.adminActionLog.create({
    data: { adminId, action, targetType: "product", targetId, detail },
  });
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
    description: formData.get("description") ?? "",
    inputFields: formData.get("inputFields"),
    nicknameCheckKey: formData.get("nicknameCheckKey") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const product = await db.product.create({
    data: {
      categoryId: parsed.data.categoryId,
      slug: parsed.data.slug,
      name: parsed.data.name,
      publisher: parsed.data.publisher,
      description: parsed.data.description,
      inputFields: parsed.data.inputFields,
      nicknameCheckKey: parsed.data.nicknameCheckKey,
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
    description: formData.get("description") ?? "",
    inputFields: formData.get("inputFields"),
    nicknameCheckKey: formData.get("nicknameCheckKey") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.product.update({
    where: { id },
    data: {
      categoryId: parsed.data.categoryId,
      slug: parsed.data.slug,
      name: parsed.data.name,
      publisher: parsed.data.publisher,
      description: parsed.data.description,
      inputFields: parsed.data.inputFields,
      nicknameCheckKey: parsed.data.nicknameCheckKey,
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

  const product = await db.product.findUnique({ where: { id } });
  if (!product) return { error: "Produk tidak ditemukan." };

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
    },
  });
  await logAdmin(admin.adminId, "catalog.update_item", id);
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${parsed.data.productId}`);
  return { ok: "Item tersimpan." };
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
