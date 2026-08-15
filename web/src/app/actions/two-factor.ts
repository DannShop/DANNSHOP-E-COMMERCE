import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "@/lib/auth/totp";
import {
  disableTwoFactor,
  enableTwoFactor,
  readStagedSecret,
  stageTotpSecret,
} from "@/lib/auth/two-factor";
import { checkRateLimit } from "@/lib/rate-limit";

export type TwoFactorResult = {
  ok?: string;
  error?: string;
  /** Terisi saat pendaftaran dimulai. */
  setup?: { secret: string; qrDataUrl: string };
  /** Terisi SEKALI saat 2FA baru diaktifkan. Setelah itu hilang selamanya. */
  recoveryCodes?: string[];
};

async function requireUser(): Promise<{ userId: string; email: string; role: string } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Tidak diizinkan" };
  const fresh = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, role: true },
  });
  if (!fresh) return { error: "Tidak diizinkan" };
  return { userId: fresh.id, email: fresh.email, role: fresh.role };
}

/** Langkah 1 — bikin rahasia baru dan tampilkan QR-nya. Belum mengaktifkan apa pun. */
export async function startTwoFactorSetup(): Promise<TwoFactorResult> {
  "use server";
  const me = await requireUser();
  if ("error" in me) return me;

  const secret = generateTotpSecret();
  await stageTotpSecret(me.userId, secret);

  const settings = await db.siteSetting.findUnique({ where: { key: "site_name" } });
  const url = otpauthUrl({
    secret,
    accountName: me.email,
    issuer: settings?.value || "DannShop",
  });

  // QR dibuat jadi data URL di server, bukan memuat gambar dari layanan luar:
  // rahasia TOTP tidak boleh pernah melintas ke pihak ketiga, dan CSP situs ini
  // memang cuma mengizinkan gambar dari diri sendiri + data:.
  const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 220 });

  return { setup: { secret, qrDataUrl } };
}

/** Langkah 2 — buktikan aplikasinya benar-benar terpasang, baru 2FA menyala. */
export async function confirmTwoFactorSetup(formData: FormData): Promise<TwoFactorResult> {
  "use server";
  const me = await requireUser();
  if ("error" in me) return me;

  const limit = await checkRateLimit(`2fa:setup:${me.userId}`, 10, 15 * 60_000);
  if (!limit.allowed) return { error: "Terlalu banyak percobaan, coba lagi beberapa menit lagi." };

  const code = String(formData.get("code") ?? "").trim();
  const secret = await readStagedSecret(me.userId);
  if (!secret) return { error: "Pendaftaran belum dimulai atau sudah kedaluwarsa — mulai ulang dari tombol di atas." };
  if (!verifyTotp(secret, code)) {
    return { error: "Kode tidak cocok. Pastikan jam di HP kamu otomatis, lalu coba kode terbaru." };
  }

  const recoveryCodes = await enableTwoFactor(me.userId);
  revalidatePath("/admin/keamanan");
  revalidatePath("/account/keamanan");
  return {
    ok: "2FA aktif. Simpan kode pemulihan di bawah sekarang — kode ini tidak akan pernah ditampilkan lagi.",
    recoveryCodes,
  };
}

/**
 * Matikan 2FA — WAJIB menyertakan password.
 *
 * Tanpa password, sesi yang tercuri (mis. laptop yang ditinggal terbuka) bisa
 * mematikan faktor kedua dalam satu klik, dan seluruh gunanya lenyap justru pada
 * skenario yang paling mungkin terjadi.
 */
export async function disableTwoFactorAction(formData: FormData): Promise<TwoFactorResult> {
  "use server";
  const me = await requireUser();
  if ("error" in me) return me;

  const limit = await checkRateLimit(`2fa:disable:${me.userId}`, 5, 15 * 60_000);
  if (!limit.allowed) return { error: "Terlalu banyak percobaan, coba lagi beberapa menit lagi." };

  // Admin tidak boleh mematikan 2FA-nya sendiri: kewajiban itulah yang menutup
  // temuan audit, dan kewajiban yang bisa dicabut sendiri oleh yang diwajibkan
  // bukan kewajiban. Kalau perangkatnya hilang, jalannya kode pemulihan.
  if (me.role === "ADMIN") {
    return { error: "Akun admin wajib memakai 2FA. Pakai kode pemulihan kalau kehilangan aplikasi autentikator." };
  }

  const user = await db.user.findUnique({ where: { id: me.userId }, select: { passwordHash: true } });
  const password = String(formData.get("password") ?? "");
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Password salah." };
  }

  await disableTwoFactor(me.userId);
  revalidatePath("/account/keamanan");
  return { ok: "2FA dimatikan." };
}
