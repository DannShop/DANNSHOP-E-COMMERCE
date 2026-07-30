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

export const testTransactionSchema = z.object({
  skuCode: z.string().min(1, "Kode SKU wajib diisi"),
  target: z.string().min(1, "Nomor tujuan wajib diisi"),
  testing: z.coerce.boolean().default(true),
});

export const balanceThresholdSchema = z.object({
  minBalanceAlert: z
    .string()
    .nullable()
    .transform((v) => (v === null || v.trim() === "" ? null : v))
    .superRefine((v, ctx) => {
      if (v === null) return;

      try {
        const bn = BigInt(v);
        if (bn < 0n) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Ambang batas tidak boleh negatif",
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Ambang batas harus berupa angka",
        });
      }
    })
    .transform((v) => (v === null ? null : BigInt(v as string))),
});

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

export async function sendTestTransaction(formData: FormData): Promise<
  ActionResult & { result?: { refId: string; status: string; sn: string | null; message: string } }
> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = testTransactionSchema.safeParse({
    skuCode: formData.get("skuCode"),
    target: formData.get("target"),
    testing: formData.get("testing") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const refId = `TEST-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  try {
    const adapter = await getAdapter("DIGIFLAZZ");
    const result = await adapter.createTransaction({ ...parsed.data, refId });
    await logAdmin(admin.adminId, "provider.test_transaction", "DIGIFLAZZ", {
      refId, skuCode: parsed.data.skuCode, status: result.status,
    });
    return { ok: `Transaksi tes terkirim (${result.status}).`, result: { refId, status: result.status, sn: result.sn, message: result.message } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Transaksi tes gagal." };
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

export async function saveBalanceThreshold(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const key = formData.get("key") as ProviderKey;
  const parsed = balanceThresholdSchema.safeParse({
    minBalanceAlert: formData.get("minBalanceAlert"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Reset balanceAlertStatus ke "OK" tiap kali ambang diubah - status LOW lama
  // bikin state machine decideBalanceAlertTransition mengira tidak ada transisi
  // (alert "menipis" berikutnya senyap), dan menurunkan ambang saat status LOW
  // bisa memicu alert "pulih" palsu. Reset memastikan evaluasi job berikutnya
  // selalu mulai dari kondisi bersih.
  await db.providerConfig.update({
    where: { key },
    data: { minBalanceAlert: parsed.data.minBalanceAlert, balanceAlertStatus: "OK" },
  });
  await logAdmin(admin.adminId, "provider.save_balance_threshold", key, {
    minBalanceAlert: parsed.data.minBalanceAlert?.toString() ?? null,
  });
  revalidatePath("/admin/providers");
  return {
    ok:
      parsed.data.minBalanceAlert === null
        ? "Alert saldo dinonaktifkan."
        : `Ambang alert saldo disetel Rp ${Number(parsed.data.minBalanceAlert).toLocaleString("id-ID")}.`,
  };
}
