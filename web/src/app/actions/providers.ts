import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ProviderKey } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptJson, decryptJson } from "@/lib/crypto";
import type { DigiflazzCredentials } from "@/lib/providers/digiflazz";
import { getAdapter } from "@/lib/providers/registry";
import { runPriceSync } from "@/lib/catalog/price-sync";

export const digiflazzCredentialsSchema = z.object({
  username: z.string().min(1, "Username wajib diisi"),
  apiKey: z.string().min(1, "API key wajib diisi"),
  // Development Key: hanya dipakai untuk transaksi `testing: true`. Dikosongkan =
  // "jangan ubah yang sudah tersimpan" (lihat saveDigiflazzCredentials).
  devApiKey: z
    .string()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  webhookSecret: z
    .string()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export type ActionResult = { ok?: string; error?: string };

// Pesan error provider dipangkas panjangnya saja, TIDAK diganti kalimat generik.
// Kalau ada yang menyebut alamat IP (kasus rc 45 Digiflazz), ditambahi petunjuk
// bahwa mendaftarkan IP itu langsung percuma di Vercel - IP-nya berganti terus.
export function describeProviderError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const message = raw.length > 300 ? `${raw.slice(0, 300)}…` : raw;
  if (/ip anda tidak kami kenali|ip tidak dikenali/i.test(message)) {
    return `${message} — jangan whitelist IP ini langsung kalau app di Vercel (IP-nya berganti tiap saat); pakai relay ber-IP tetap, lihat docs/08-IP-TETAP-DIGIFLAZZ.md.`;
  }
  return message;
}

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
  const fresh = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true, updatedAt: true } });
  if (!fresh || fresh.role !== "ADMIN" || fresh.updatedAt.getTime() !== session.user.updatedAt) {
    return { error: "Tidak diizinkan" };
  }
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
    devApiKey: formData.get("devApiKey") ?? "",
    webhookSecret: formData.get("webhookSecret") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Field opsional yang DIKOSONGKAN berarti "biarkan yang tersimpan", bukan "hapus".
  //
  // Sebelumnya blob kredensial ditimpa mentah-mentah, padahal form tidak pernah
  // mengisi ulang nilai rahasia yang sudah tersimpan (sengaja - jangan kirim
  // rahasia balik ke browser). Akibatnya setiap kali admin menyimpan ulang
  // username/API key, webhookSecret ikut TERHAPUS diam-diam - dan verifikasi
  // signature callback Digiflazz langsung berhenti berfungsi tanpa satu pun
  // pesan error, sampai ada yang sadar status order tidak pernah update lagi.
  const existing = await db.providerConfig.findUnique({ where: { key: "DIGIFLAZZ" } });
  let current: Partial<DigiflazzCredentials> = {};
  if (typeof existing?.credentials === "string" && existing.credentials.length > 0) {
    try {
      current = decryptJson<DigiflazzCredentials>(existing.credentials);
    } catch (e) {
      // Kredensial lama tidak bisa didekripsi (mis. CREDENTIALS_ENCRYPTION_KEY
      // berganti). Jangan menggagalkan penyimpanan - admin justru sedang
      // memperbaiki keadaan itu; cukup jangan pertahankan apa pun dari yang lama.
      console.error("saveDigiflazzCredentials: kredensial lama gagal didekripsi, disimpan sebagai baru", { error: e });
    }
  }

  const merged: DigiflazzCredentials = {
    username: parsed.data.username,
    apiKey: parsed.data.apiKey,
    devApiKey: parsed.data.devApiKey ?? current.devApiKey,
    webhookSecret: parsed.data.webhookSecret ?? current.webhookSecret,
  };

  await db.providerConfig.update({
    where: { key: "DIGIFLAZZ" },
    data: { credentials: encryptJson(merged) },
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
    console.error("checkProviderBalance: gagal cek saldo", { provider: key, error: e });
    // Pesan asli provider DITAMPILKAN, bukan ditelan jadi "coba lagi". Untuk kelas
    // kegagalan konfigurasi (IP belum di-whitelist, signature salah), pesan itu
    // memuat satu-satunya informasi yang menentukan - termasuk alamat IP persis
    // yang perlu didaftarkan. "Coba lagi" justru menyuruh admin mengulangi hal
    // yang dijamin gagal, dan menyembunyikan sebabnya. Aman ditampilkan: ini
    // halaman admin, dan kredensial tidak pernah ikut di pesan error Digiflazz.
    return { error: `Gagal cek saldo ${key}: ${describeProviderError(e)}` };
  }
}

// skuCode/target/testing ikut dikembalikan supaya tombol "Cek Status" bisa
// mengirim ulang request yang SAMA PERSIS - cek status Digiflazz bukan sekadar
// menanyakan ref_id, melainkan mengulang request transaksi identik.
export async function sendTestTransaction(formData: FormData): Promise<
  ActionResult & {
    result?: {
      refId: string; status: string; sn: string | null; message: string;
      skuCode: string; target: string; testing: boolean;
    };
  }
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
    return {
      ok: `Transaksi tes terkirim (${result.status}).`,
      result: {
        refId, status: result.status, sn: result.sn, message: result.message,
        skuCode: parsed.data.skuCode, target: parsed.data.target, testing: parsed.data.testing,
      },
    };
  } catch (e) {
    console.error("testProviderTransaction: transaksi tes gagal", { error: e });
    return { error: `Transaksi tes gagal: ${describeProviderError(e)}` };
  }
}

export const checkTestTransactionSchema = z.object({
  skuCode: z.string().min(1, "Kode SKU wajib diisi"),
  target: z.string().min(1, "Nomor tujuan wajib diisi"),
  refId: z.string().min(1, "Ref ID wajib diisi"),
  testing: z.coerce.boolean().default(false),
});

// Cek status transaksi tes yang tadi dikirim.
//
// KENAPA PERLU: Digiflazz membalas `Pending` secara SINKRON untuk hampir semua
// topup, lalu mengirim hasil finalnya belakangan lewat callback. Form tes cuma
// menampilkan balasan sinkron itu, jadi hasilnya "Diproses" selamanya walaupun
// transaksinya sudah sukses di sisi Digiflazz - persis kebingungan yang wajar
// muncul saat mengecek transaksi ke SKU asli.
//
// AMAN DIULANG: cek status Digiflazz = mengirim ulang request transaksi yang
// sama persis, dan mereka idempotent by ref_id - tidak akan membuat transaksi
// kedua atau memotong saldo dua kali (lihat komentar TopupProviderAdapter.checkStatus).
export async function checkTestTransactionStatus(formData: FormData): Promise<
  ActionResult & { result?: { refId: string; status: string; sn: string | null; message: string } }
> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = checkTestTransactionSchema.safeParse({
    skuCode: formData.get("skuCode"),
    target: formData.get("target"),
    refId: formData.get("refId"),
    testing: formData.get("testing") === "true",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    // allowInactive: true - ini operasi baca terhadap transaksi yang SUDAH terkirim,
    // bukan transaksi baru; kill-switch provider tidak boleh memblokirnya (pola yang
    // sama dipakai jalur recheck-fulfillment di lib/order/fulfillment.ts).
    const adapter = await getAdapter("DIGIFLAZZ", db, { allowInactive: true });
    const result = await adapter.checkStatus(parsed.data);
    return {
      ok: `Status terkini: ${result.status}.`,
      result: { refId: parsed.data.refId, status: result.status, sn: result.sn, message: result.message },
    };
  } catch (e) {
    console.error("checkTestTransactionStatus: gagal cek status transaksi tes", { error: e });
    return { error: `Gagal cek status: ${describeProviderError(e)}` };
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
    console.error("syncProviderNow: sync gagal", { provider: key, error: e });
    return { error: "Sync harga gagal, coba lagi." };
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
