import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ProviderKey } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptJson } from "@/lib/crypto";
import { getAdapter } from "@/lib/providers/registry";
import { runPriceSync } from "@/lib/catalog/price-sync";

export const digiflazzCredentialsSchema = z.object({
  username: z.string().min(1, "Username wajib diisi"),
  apiKey: z.string().min(1, "API key wajib diisi"),
  webhookSecret: z
    .string()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export type ActionResult = { ok?: string; error?: string };

// Catatan: "use server" sengaja dipasang inline per-fungsi (bukan di baris pertama
// file) karena Next.js 16 melarang file ber-directive "use server" di level file
// meng-export apa pun selain async function ("A 'use server' file can only export
// async functions, found object") — sementara digiflazzCredentialsSchema (Zod
// object) & ActionResult (type) harus tetap di-export dari file ini untuk dites.
// Pola ini didokumentasikan resmi di Next.js (lihat use-server.md § "Using use
// server inline"). Logika tiap action tidak berubah dari spec.

async function requireAdmin(): Promise<{ adminId: string } | { error: string }> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) return { error: "Tidak diizinkan" };
  return { adminId: session.user.id };
}

async function logAdmin(adminId: string, action: string, targetId: string, detail?: object) {
  await db.adminActionLog.create({
    data: { adminId, action, targetType: "provider", targetId, detail },
  });
}

export async function saveDigiflazzCredentials(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = digiflazzCredentialsSchema.safeParse({
    username: formData.get("username"),
    apiKey: formData.get("apiKey"),
    webhookSecret: formData.get("webhookSecret") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.providerConfig.update({
    where: { key: "DIGIFLAZZ" },
    data: { credentials: encryptJson(parsed.data) },
  });
  await logAdmin(admin.adminId, "provider.save_credentials", "DIGIFLAZZ"); // isi kredensial TIDAK di-log
  revalidatePath("/admin/providers");
  return { ok: "Kredensial Digiflazz tersimpan." };
}

export async function toggleProviderActive(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const key = formData.get("key") as ProviderKey;
  const config = await db.providerConfig.findUnique({ where: { key } });
  if (!config) return { error: "Provider tidak ditemukan." };
  if (!config.isActive && !config.credentials) return { error: "Isi kredensial dulu sebelum mengaktifkan." };

  await db.providerConfig.update({ where: { key }, data: { isActive: !config.isActive } });
  await logAdmin(admin.adminId, config.isActive ? "provider.deactivate" : "provider.activate", key);
  revalidatePath("/admin/providers");
  return { ok: `Provider ${key} ${config.isActive ? "dinonaktifkan" : "diaktifkan"}.` };
}

export async function checkProviderBalance(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const key = formData.get("key") as ProviderKey;
  try {
    const adapter = await getAdapter(key);
    const balance = await adapter.fetchBalance();
    const config = await db.providerConfig.update({
      where: { key },
      data: { balance, healthStatus: "HEALTHY", lastHealthCheckAt: new Date() },
    });
    await db.providerBalanceLog.create({ data: { providerId: config.id, balance } });
    await logAdmin(admin.adminId, "provider.check_balance", key, { balance: balance.toString() });
    revalidatePath("/admin/providers");
    return { ok: `Saldo ${key}: Rp ${Number(balance).toLocaleString("id-ID")}` };
  } catch (e) {
    await db.providerConfig.update({
      where: { key },
      data: { healthStatus: "DOWN", lastHealthCheckAt: new Date() },
    });
    return { error: e instanceof Error ? e.message : "Gagal cek saldo." };
  }
}

export async function syncProviderNow(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const key = formData.get("key") as ProviderKey;
  try {
    const result = await runPriceSync(key);
    await logAdmin(admin.adminId, "provider.sync_prices", key, result);
    revalidatePath("/admin/providers");
    return { ok: `Sync ${key}: ${result.updated} SKU diupdate, ${result.missing} hilang.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sync gagal." };
  }
}
