import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  saveMidtransConfig,
  getStoredMidtransConfig,
  getMidtransCreds,
  getMidtransRuntime,
  type MidtransIntegrationMode,
} from "@/lib/payment/gateway-config";
import {
  pingMidtrans,
  chargeByMethodCode,
  createSnapTransaction,
  cancelTransaction,
  describeMidtransFailure,
} from "@/lib/midtrans/client";
import { MIN_EXPIRY_MINUTES } from "@/lib/payment/rules";
import { savePaymentRules } from "@/lib/payment/rules";
import { getBaseUrl } from "@/lib/base-url";
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
  // Client key TIDAK rahasia (Snap menanamkannya di halaman), jadi tidak pakai
  // pola "kosong = jangan ubah" seperti server key - nilainya ditampilkan utuh
  // di form dan disimpan apa adanya.
  clientKey: z.string().trim().max(200),
  integrationMode: z.string().nullish(),
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
    clientKey: formData.get("clientKey") ?? "",
    integrationMode: formData.get("integrationMode"),
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
  const integrationMode: MidtransIntegrationMode = parsed.data.integrationMode === "snap" ? "snap" : "core_api";

  // Snap MUSTAHIL jalan tanpa client key - popupnya dimuat di browser dan
  // Snap.js menolak tanpa data-client-key. Ditolak di sini, bukan dibiarkan
  // tersimpan lalu gagal senyap saat customer pertama membuka invoice.
  if (integrationMode === "snap" && !parsed.data.clientKey) {
    return { error: "Mode Snap butuh Client Key. Ambil di dashboard Midtrans → Settings → Access Keys." };
  }

  await saveMidtransConfig({
    serverKey,
    clientKey: parsed.data.clientKey,
    merchantId: parsed.data.merchantId,
    isProduction,
    integrationMode,
  });

  // Server key TIDAK PERNAH masuk log admin - cuma fakta bahwa dia berubah.
  await logAdmin(admin.adminId, "payment_config.midtrans.update", {
    isProduction,
    integrationMode,
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
    // SENGAJA tidak bilang "pembayaran siap" - uji ini cuma membuktikan
    // kredensialnya sah. Channel yang belum diaktifkan Midtrans (status_code
    // 402 "Payment channel is not activated.") tetap lolos di sini karena
    // GET status tidak menyentuh channel sama sekali. Menyatakan "berhasil"
    // tanpa kualifikasi persis lampu hijau palsu yang bikin admin mengira
    // semuanya beres padahal QRIS-nya mati.
    return {
      ok:
        `Kredensial sah: server key ini diterima Midtrans di mode ${modeLabel}. ` +
        `Ini BELUM membuktikan channel pembayarannya aktif — jalankan "Uji Channel Pembayaran" di bawah untuk itu.`,
    };
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

export interface ChannelTestRow {
  code: string;
  label: string;
  ok: boolean;
  /** null kalau ok. Kalau gagal, alasan mentah dari Midtrans. */
  reason: string | null;
}

export interface ChannelTestResult {
  error?: string;
  mode?: string;
  rows?: ChannelTestRow[];
}

// Nominal uji. Di atas batas minimum semua channel yang dipakai (beberapa VA
// menolak di bawah Rp 10.000), jadi kegagalan yang muncul benar-benar soal
// aktivasi channel, bukan soal nominal yang kekecilan.
const CHANNEL_TEST_AMOUNT = 10_000;

/**
 * Menjawab pertanyaan yang sebenarnya ingin diketahui admin: "kalau ada
 * customer checkout SEKARANG, jalan atau tidak?"
 *
 * testMidtransConnection() tidak bisa menjawab itu - GET status tidak
 * menyentuh channel pembayaran sama sekali, jadi channel yang belum diaktifkan
 * Midtrans tetap tampak sehat di sana. Satu-satunya cara mengetahuinya adalah
 * benar-benar mencoba charge, jadi fungsi ini MEMBUAT transaksi percobaan
 * untuk tiap metode aktif lalu langsung membatalkannya.
 *
 * Kejadian yang melahirkan fungsi ini (2026-08-08): kredensial production
 * sah sepenuhnya, tapi tiap checkout QRIS gagal karena Midtrans membalas
 * HTTP 200 + status_code 402 "Payment channel is not activated." Tidak ada
 * satu pun permukaan di panel yang bisa menunjukkan itu sebelum customer
 * pertama gagal membayar.
 */
export async function testPaymentChannels(): Promise<ChannelTestResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return { error: admin.error };

  const { creds, mode: integrationMode } = await getMidtransRuntime();
  if (!creds.serverKey) {
    return { error: "Belum ada server key tersimpan - isi dan simpan dulu sebelum menguji channel." };
  }

  const methods = await db.paymentMethodConfig.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  if (methods.length === 0) {
    return { error: "Tidak ada metode pembayaran aktif untuk diuji." };
  }

  const mode = `${creds.isProduction ? "Production" : "Sandbox"} · ${integrationMode === "snap" ? "Snap" : "Core API"}`;
  const rows: ChannelTestRow[] = [];

  // Berurutan, bukan Promise.all: ini menembak gateway pembayaran sungguhan,
  // dan menembakkan 9 charge sekaligus adalah cara cepat kena rate limit.
  for (const method of methods) {
    const probeOrderId = `TEST-${method.code}-${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`;
    try {
      if (integrationMode === "snap") {
        // Snap cuma menerbitkan token; tidak ada transaksi yang terbentuk
        // sampai ada yang membayarnya, jadi tidak ada yang perlu dibatalkan.
        // Yang diuji di sini: apakah metode ini punya padanan enabled_payments
        // DAN diterima Snap untuk akun ini.
        await createSnapTransaction(
          {
            orderId: probeOrderId,
            grossAmount: CHANNEL_TEST_AMOUNT,
            methodCode: method.code,
            expiryMinutes: MIN_EXPIRY_MINUTES,
            // Probe: tidak ada yang akan membayarnya, jadi tidak ada pembeli
            // yang bisa mendarat di sini. Diisi beranda supaya field wajibnya
            // terpenuhi dengan URL yang tetap masuk akal seandainya toh dibuka.
            finishUrl: await getBaseUrl(),
          },
          creds,
        );
      } else {
        await chargeByMethodCode(method.code, probeOrderId, CHANNEL_TEST_AMOUNT, MIN_EXPIRY_MINUTES, creds);
        // Berhasil dibuat = channel hidup. Langsung dibatalkan supaya tidak
        // menumpuk transaksi menggantung di dashboard Midtrans.
        await cancelTransaction(probeOrderId, creds);
      }
      rows.push({ code: method.code, label: method.label, ok: true, reason: null });
    } catch (e) {
      const failure = describeMidtransFailure(e);
      rows.push({
        code: method.code,
        label: method.label,
        ok: false,
        reason: failure.statusMessage ?? failure.message,
      });
    }
  }

  await logAdmin(admin.adminId, "payment_config.channels.test", {
    mode,
    hasil: rows.map((r) => ({ code: r.code, ok: r.ok, reason: r.reason })),
  });

  return { mode, rows };
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
