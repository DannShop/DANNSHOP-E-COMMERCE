import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveMidtransConfig, getStoredMidtransConfig, getMidtransCreds } from "@/lib/payment/gateway-config";
import { pingMidtrans } from "@/lib/midtrans/client";
import { savePaymentRules } from "@/lib/payment/rules";
import { MAX_UNIQUE_CODE } from "@/lib/payment/fee";

export type ActionResult = { ok?: string; error?: string };

// Catatan: requireAdmin/logAdmin didefinisikan lokal (bukan diimpor dari file
// actions/* lain) — pola yang sama di seluruh actions/* karena file ber-directive
// "use server" per-fungsi tidak bisa mengekspor helper biasa untuk diimpor
// lintas file. Lihat catalog.ts untuk penjelasan lengkap.

async function requireAdmin(): Promise<{ adminId: string } | { error: string }> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) return { error: "Tidak diizinkan" };
  const fresh = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true, updatedAt: true } });
  if (!fresh || fresh.role !== "ADMIN" || fresh.updatedAt.getTime() !== session.user.updatedAt) {
    return { error: "Tidak diizinkan" };
  }
  return { adminId: session.user.id };
}

async function logAdmin(adminId: string, action: string, detail?: object) {
  await db.adminActionLog.create({
    data: { adminId, action, targetType: "payment_config", detail },
  });
}

const midtransSchema = z.object({
  // Boleh kosong: kosong berarti "jangan ubah server key yang sudah tersimpan",
  // supaya admin bisa memindahkan sandbox<->production tanpa mengetik ulang key.
  serverKey: z.string().trim().max(200),
  merchantId: z.string().trim().max(100),
  // .nullish() (= optional + nullable), BUKAN .optional(): checkbox yang TIDAK
  // dicentang bikin formData.get() mengembalikan `null` (bukan absen), dan
  // .optional() Zod cuma menerima `undefined` - null selalu ditolak dengan
  // pesan membingungkan "expected string, received null" padahal field ini
  // memang boleh kosong. Diperbaiki di level SKEMA supaya call site baru tidak
  // bisa menghidupkan ulang bug ini karena lupa menormalkan null.
  isProduction: z.string().nullish(),
});

export async function saveMidtransCredentials(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = midtransSchema.safeParse({
    serverKey: formData.get("serverKey") ?? "",
    merchantId: formData.get("merchantId") ?? "",
    isProduction: formData.get("isProduction"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const stored = await getStoredMidtransConfig();
  const serverKey = parsed.data.serverKey || stored?.serverKey || "";
  if (!serverKey) {
    return { error: "Server key wajib diisi saat pertama kali menyimpan." };
  }

  const isProduction = parsed.data.isProduction === "on";

  await saveMidtransConfig({ serverKey, merchantId: parsed.data.merchantId, isProduction });

  // Server key TIDAK PERNAH masuk log admin - cuma fakta bahwa dia berubah.
  await logAdmin(admin.adminId, "payment_config.midtrans.update", {
    isProduction,
    serverKeyChanged: Boolean(parsed.data.serverKey),
  });
  revalidatePath("/admin/payment-config");

  // Peringatan (BUKAN blokir save) kalau key production dipasang saat mode
  // Sandbox dicentang. Sengaja tidak menolak simpan: format prefix key
  // sandbox Midtrans pernah berubah/tidak konsisten antar akun merchant, jadi
  // menjadikan ini gerbang keras pernah menahan admin menyimpan key yang
  // sebenarnya valid. Kesalahan mismatch key<->mode yang sebenarnya tetap
  // akan ketahuan cepat lewat gejala nyata (charge/status gagal), bukan lewat
  // tebakan prefix di sini.
  if (isProduction && serverKey.startsWith("SB-")) {
    return { ok: "Konfigurasi Midtrans tersimpan. Peringatan: mode Production dicentang tapi key diawali \"SB-\" (biasanya penanda sandbox) - pastikan ini memang key yang benar." };
  }
  return { ok: "Konfigurasi Midtrans tersimpan." };
}

// Memvalidasi kredensial yang BENAR-BENAR aktif (hasil getMidtransCreds, jadi
// ikut menguji jalur decrypt & fallback env, bukan cuma isi form) langsung ke
// Midtrans, tanpa membuat transaksi apa pun.
//
// Ada karena satu-satunya cara mengetahui key/mode salah dulu adalah menunggu
// customer gagal checkout: panel menyimpan apa pun yang diketik admin tanpa
// pernah menanyakannya ke Midtrans. Tebakan prefix key tidak bisa menggantikan
// ini - Midtrans menerbitkan key sandbox yang diawali "Mid-server-" persis
// seperti key production, jadi mismatch key<->mode MUSTAHIL dideteksi tanpa
// benar-benar memanggil API-nya.
export async function testMidtransConnection(): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const creds = await getMidtransCreds();
  if (!creds.serverKey) {
    return { error: "Belum ada server key tersimpan - isi dan simpan dulu sebelum menguji koneksi." };
  }

  const modeLabel = creds.isProduction ? "Production" : "Sandbox";
  const result = await pingMidtrans(creds);
  if (result.ok) {
    return { ok: `Koneksi berhasil. Server key ini sah untuk mode ${modeLabel}.` };
  }

  // Kegagalan otentikasi -> uji key yang SAMA di environment seberang. Kalau di
  // sana lolos, penyebabnya bukan key rusak melainkan salah pasang mode, dan
  // admin langsung dapat instruksi tepat alih-alih pesan mentah Midtrans.
  if (result.statusCode === 401) {
    const opposite = await pingMidtrans({ serverKey: creds.serverKey, isProduction: !creds.isProduction });
    if (opposite.ok) {
      const realMode = creds.isProduction ? "Sandbox" : "Production";
      return {
        error:
          `Server key ditolak Midtrans di mode ${modeLabel}, tetapi DITERIMA di mode ${realMode}. ` +
          `Berarti key yang tersimpan sebenarnya key ${realMode}. ` +
          (creds.isProduction
            ? "Ambil Server Key dari dashboard Midtrans saat toggle di kanan atas berada di Production, lalu simpan ulang di sini."
            : "Centang Mode Production, atau ganti dengan Server Key dari dashboard mode Sandbox."),
      };
    }
    return {
      error:
        `Server key ditolak Midtrans di mode ${modeLabel} maupun mode seberangnya ` +
        `(${result.statusMessage ?? "401 unauthorized"}). Pastikan key disalin utuh tanpa spasi dan akun Midtrans-nya aktif.`,
    };
  }

  return {
    error:
      `Uji koneksi gagal di mode ${modeLabel}: ` +
      `${result.statusMessage ?? "tidak ada pesan"} (HTTP ${result.httpStatus ?? "-"} / status_code ${result.statusCode ?? "-"}).`,
  };
}

const rulesSchema = z
  .object({
    // .nullish() bukan .optional() - lihat penjelasan di midtransSchema di atas.
    uniqueCodeOrder: z.string().nullish(),
    uniqueCodeDeposit: z.string().nullish(),
    feeOrder: z.string().nullish(),
    feeDeposit: z.string().nullish(),
    uniqueCodeMin: z.coerce.number().int().min(1, "Kode unik minimum minimal 1"),
    uniqueCodeMax: z.coerce.number().int().max(MAX_UNIQUE_CODE, `Kode unik maksimum maksimal ${MAX_UNIQUE_CODE}`),
  })
  .refine((v) => v.uniqueCodeMin <= v.uniqueCodeMax, {
    message: "Kode unik minimum tidak boleh lebih besar dari maksimum",
    path: ["uniqueCodeMin"],
  });

export async function savePaymentRulesAction(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = rulesSchema.safeParse({
    uniqueCodeOrder: formData.get("uniqueCodeOrder"),
    uniqueCodeDeposit: formData.get("uniqueCodeDeposit"),
    feeOrder: formData.get("feeOrder"),
    feeDeposit: formData.get("feeDeposit"),
    uniqueCodeMin: formData.get("uniqueCodeMin"),
    uniqueCodeMax: formData.get("uniqueCodeMax"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const rules = {
    uniqueCodeOrder: parsed.data.uniqueCodeOrder === "on",
    uniqueCodeDeposit: parsed.data.uniqueCodeDeposit === "on",
    feeOrder: parsed.data.feeOrder === "on",
    feeDeposit: parsed.data.feeDeposit === "on",
    uniqueCodeMin: parsed.data.uniqueCodeMin,
    uniqueCodeMax: parsed.data.uniqueCodeMax,
  };
  await savePaymentRules(rules);
  await logAdmin(admin.adminId, "payment_config.rules.update", rules);
  revalidatePath("/admin/payment-config");
  return { ok: "Aturan kode unik & biaya admin tersimpan." };
}
