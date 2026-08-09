"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkRateLimit, extractIp } from "@/lib/rate-limit";
import {
  getIdCheckConfig,
  performIdCheck,
  saveIdCheckConfig,
  validateIdCheckUrl,
  type IdCheckHeader,
} from "@/lib/catalog/id-check";

export type ActionResult = { ok?: string; error?: string };

async function requireAdmin(): Promise<{ adminId: string } | { error: string }> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) return { error: "Tidak diizinkan" };
  const fresh = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true, updatedAt: true } });
  if (!fresh || fresh.role !== "ADMIN" || fresh.updatedAt.getTime() !== session.user.updatedAt) {
    return { error: "Tidak diizinkan" };
  }
  return { adminId: session.user.id };
}

// ===== Jalur publik: dipanggil dari halaman produk =====

export type PublicIdCheckResult = { nickname?: string; error?: string };

/**
 * Mengecek nickname untuk sebuah produk. Dipanggil pengunjung mana pun,
 * termasuk yang belum login - jadi diperlakukan sebagai endpoint publik penuh:
 * rate limit per IP, dan tidak pernah membocorkan konfigurasi/kredensial
 * penyedia ke pemanggil, hanya nickname atau pesan yang aman dibaca pembeli.
 */
export async function checkGameId(productId: string, target: Record<string, string>): Promise<PublicIdCheckResult> {
  const ip = extractIp(await headers());
  // 15/menit: cukup longgar untuk pembeli yang salah ketik beberapa kali,
  // cukup ketat supaya kuota API penyedia (yang sering gratisan & kecil) tidak
  // habis dipakai orang yang menjadikan toko kita proksi cek ID gratis.
  const limit = await checkRateLimit(`id-check:ip:${ip}`, 15, 60_000);
  if (!limit.allowed) return { error: "Terlalu banyak percobaan cek ID, tunggu sebentar." };

  const [config, product] = await Promise.all([
    getIdCheckConfig(),
    db.product.findUnique({
      where: { id: productId },
      select: { isActive: true, idCheckEnabled: true, nicknameCheckKey: true, inputFields: true },
    }),
  ]);

  if (!config.enabled) return { error: "Fitur cek ID sedang dimatikan." };
  if (!product || !product.isActive) return { error: "Produk tidak ditemukan." };
  if (!product.idCheckEnabled) return { error: "Produk ini tidak mendukung cek ID." };

  // Hanya field yang memang didefinisikan produk yang diteruskan. Tanpa ini,
  // pemanggil bisa menyuntikkan pasangan kunci-nilai sembarang yang berakhir
  // di URL penyedia sebagai placeholder yang tidak kita niatkan.
  const fields = (product.inputFields as { name: string }[]) ?? [];
  const cleanTarget: Record<string, string> = {};
  for (const f of fields) {
    const value = target[f.name];
    if (typeof value === "string" && value.trim() !== "") cleanTarget[f.name] = value.trim().slice(0, 64);
  }
  if (Object.keys(cleanTarget).length === 0) return { error: "Isi dulu data akunmu." };

  const result = await performIdCheck({
    config,
    gameCode: product.nicknameCheckKey ?? "",
    target: cleanTarget,
  });
  return result.ok ? { nickname: result.nickname } : { error: result.error };
}

// ===== Jalur admin: konfigurasi & tes =====

const headerSchema = z.array(z.object({ name: z.string(), value: z.string() })).max(10, "Maksimal 10 header");

const configSchema = z.object({
  enabled: z.string().nullish().transform((v) => v === "on"),
  urlTemplate: z.string().optional().transform((v) => (v ?? "").trim()),
  method: z.enum(["GET", "POST"]),
  bodyTemplate: z.string().max(2000).optional().transform((v) => (v ?? "").trim()),
  nicknamePath: z.string().min(1, "Path nickname wajib diisi").max(120),
  errorPath: z.string().max(120).optional().transform((v) => (v ?? "").trim()),
  timeoutMs: z.coerce.number().int().min(1000, "Timeout minimal 1000 ms").max(20_000, "Timeout maksimal 20000 ms"),
});

export async function saveIdCheckConfigAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = configSchema.safeParse({
    enabled: formData.get("enabled"),
    urlTemplate: formData.get("urlTemplate"),
    method: formData.get("method") === "POST" ? "POST" : "GET",
    bodyTemplate: formData.get("bodyTemplate"),
    nicknamePath: formData.get("nicknamePath"),
    errorPath: formData.get("errorPath"),
    timeoutMs: formData.get("timeoutMs") ?? 8000,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  let rawHeaders: unknown = [];
  const headersField = formData.get("headers");
  if (typeof headersField === "string" && headersField.trim() !== "") {
    try {
      rawHeaders = JSON.parse(headersField);
    } catch {
      return { error: "Data header tidak valid." };
    }
  }
  const headersParsed = headerSchema.safeParse(rawHeaders);
  if (!headersParsed.success) return { error: headersParsed.error.issues[0].message };

  const existing = await getIdCheckConfig();
  // Header bernilai kosong dianggap "pertahankan nilai lama" - form tidak
  // pernah menampilkan nilai header (bisa API key), jadi menyimpannya apa
  // adanya berarti API key terhapus tiap kali admin mengubah hal lain.
  const mergedHeaders: IdCheckHeader[] = headersParsed.data
    .filter((h) => h.name.trim() !== "")
    .map((h) => ({
      name: h.name.trim(),
      value: h.value !== "" ? h.value : (existing.headers.find((e) => e.name === h.name.trim())?.value ?? ""),
    }));

  if (parsed.data.enabled && !parsed.data.urlTemplate) {
    return { error: "URL penyedia wajib diisi sebelum fitur ini bisa dinyalakan." };
  }
  if (parsed.data.urlTemplate) {
    // Divalidasi dengan placeholder terisi contoh - URL bertemplate tidak bisa
    // di-parse mentah karena "{user_id}" bukan karakter URL yang sah.
    const sample = parsed.data.urlTemplate.replace(/\{[a-zA-Z0-9_]+\}/g, "1");
    const urlError = validateIdCheckUrl(sample);
    if (urlError) return { error: urlError };
  }

  await saveIdCheckConfig({
    enabled: parsed.data.enabled,
    urlTemplate: parsed.data.urlTemplate,
    method: parsed.data.method,
    bodyTemplate: parsed.data.bodyTemplate,
    headers: mergedHeaders,
    nicknamePath: parsed.data.nicknamePath,
    errorPath: parsed.data.errorPath,
    timeoutMs: parsed.data.timeoutMs,
  });
  // Nilai header (bisa memuat API key) TIDAK ikut dicatat - hanya namanya.
  await db.adminActionLog.create({
    data: {
      adminId: admin.adminId,
      action: "id_check.save_config",
      targetType: "site_setting",
      detail: { enabled: parsed.data.enabled, headerNames: mergedHeaders.map((h) => h.name) },
    },
  });
  revalidatePath("/admin/id-check");
  return { ok: "Konfigurasi cek ID tersimpan." };
}

/** Uji coba dari panel admin memakai kode game & data yang diketik admin sendiri. */
export async function testIdCheckAction(
  gameCode: string,
  target: Record<string, string>,
): Promise<{ nickname?: string; error?: string; raw?: string }> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const config = await getIdCheckConfig();
  if (!config.urlTemplate) return { error: "Isi dulu URL penyedia lalu simpan." };

  // Tes SENGAJA mengabaikan saklar `enabled`: justru inilah cara admin
  // memastikan konfigurasinya benar SEBELUM menyalakannya untuk pembeli.
  const result = await performIdCheck({ config, gameCode, target });
  return result.ok ? { nickname: result.nickname } : { error: result.error };
}
