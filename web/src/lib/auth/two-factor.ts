import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { verifyTotp } from "@/lib/auth/totp";

/**
 * Lapisan basis data untuk 2FA. Seluruh matematika TOTP-nya ada di totp.ts yang
 * murni dan sudah dikunci vektor uji RFC 6238.
 */

const RECOVERY_CODE_COUNT = 8;

/**
 * Hash kode pemulihan.
 *
 * SHA-256 polos, BUKAN bcrypt, dan itu disengaja: kode pemulihan dibangkitkan
 * dari 40 bit acak kriptografis, bukan dipilih manusia. Yang membuat bcrypt
 * berharga adalah lambatnya menebak password yang bisa ditebak — di sini tidak
 * ada yang bisa ditebak, dan lambatnya justru merugikan karena tiap percobaan
 * login harus mencocokkan sampai delapan kode. Pola yang sama sudah dipakai
 * PasswordResetToken.
 */
function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code.toUpperCase().replace(/-/g, "")).digest("hex");
}

/** Kode acak berformat XXXX-XXXX. Huruf yang gampang tertukar dibuang. */
function generateRecoveryCode(): string {
  // Tanpa I, O, 0, 1: kode ini dibaca dari layar lalu diketik ulang, sering kali
  // berbulan-bulan kemudian dari catatan tulisan tangan.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

export interface TwoFactorStatus {
  enabled: boolean;
  /** Kode pemulihan yang belum terpakai. */
  recoveryLeft: number;
}

export async function getTwoFactorStatus(userId: string): Promise<TwoFactorStatus> {
  const [user, recoveryLeft] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { totpEnabledAt: true } }),
    db.totpRecoveryCode.count({ where: { userId, usedAt: null } }),
  ]);
  return { enabled: Boolean(user?.totpEnabledAt), recoveryLeft };
}

/**
 * Simpan rahasia baru TANPA mengaktifkan 2FA.
 *
 * Pemisahan ini yang mencegah orang mengunci dirinya sendiri: rahasia harus
 * sudah tersimpan supaya QR-nya bisa ditampilkan dan diverifikasi, tapi selama
 * `totpEnabledAt` masih null, login tetap berjalan seperti biasa. Menutup
 * halaman di tengah pendaftaran tidak berakibat apa-apa.
 */
export async function stageTotpSecret(userId: string, secret: string): Promise<void> {
  await writeTotpFields(userId, encryptJson({ secret }), null);
}

/**
 * Tulis kolom 2FA TANPA menyentuh `User.updatedAt`.
 *
 * INI BUKAN OPTIMASI — tanpa ini, memasang 2FA menendang orangnya keluar di
 * tengah pemasangan, dan bug-nya sudah kejadian di produksi.
 *
 * Sebabnya: `proxy.ts` membandingkan `User.updatedAt` di database dengan nilai
 * yang tersimpan di JWT, dan mengalihkan ke /login begitu keduanya berbeda. Itu
 * memang disengaja — JWT di sini stateless 8 jam, jadi tanpa pembanding itu
 * penangguhan akun tidak akan menendang sesi yang sudah berjalan.
 *
 * Masalahnya, `@updatedAt` milik Prisma ikut maju pada SETIAP `update()`,
 * termasuk update yang tidak ada hubungannya dengan identitas atau hak akses.
 * Akibatnya: klik "Aktifkan 2FA" → rahasia ditulis → updatedAt maju → sesi
 * dianggap basi → langkah konfirmasi berikutnya kena pengalihan ke /login.
 * Karena langkah itu sebuah Server Action, pengalihan bukan balasan yang sah,
 * dan yang terlihat pengguna adalah layar putih "This page couldn't load".
 *
 * Dipakai SQL mentah, bukan `update()` dengan `updatedAt` diisi manual, karena
 * perilaku Prisma untuk kolom ber-`@updatedAt` yang diisi eksplisit tidak
 * dijamin antarversi — sementara jalur ini tidak boleh "kadang benar". MySQL
 * tidak punya ON UPDATE untuk kolom ini (nilainya ditentukan Prisma di sisi
 * klien), jadi SQL mentah pasti meninggalkannya apa adanya. Nilai tetap
 * diparameterkan, tidak pernah dirangkai ke string.
 */
async function writeTotpFields(userId: string, secretEnc: string | null, enabledAt: Date | null): Promise<void> {
  await db.$executeRaw`
    UPDATE \`User\`
    SET \`totpSecretEnc\` = ${secretEnc}, \`totpEnabledAt\` = ${enabledAt}
    WHERE \`id\` = ${userId}
  `;
}

export async function readStagedSecret(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { totpSecretEnc: true } });
  if (typeof user?.totpSecretEnc !== "string" || user.totpSecretEnc.length === 0) return null;
  try {
    return decryptJson<{ secret: string }>(user.totpSecretEnc).secret;
  } catch {
    // Kunci enkripsi berganti / data rusak. Diperlakukan sebagai "belum ada
    // rahasia" supaya orangnya bisa mendaftar ulang, bukan sebagai error yang
    // membuat halaman keamanan mati total.
    return null;
  }
}

/**
 * Aktifkan 2FA setelah satu kode terbukti benar, lalu terbitkan kode pemulihan.
 *
 * Mengembalikan kode MENTAH — satu-satunya kali kode itu pernah ada dalam bentuk
 * terbaca. Yang tersimpan cuma hash-nya.
 */
export async function enableTwoFactor(userId: string): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);

  const secretEnc = await readRawSecretEnc(userId);

  await db.$transaction([
    // Kode lama dibuang seluruhnya, bukan ditambahi: penerbitan ulang harus
    // membatalkan kertas lama, kalau tidak kode yang sudah dianggap hangus tetap
    // bisa dipakai masuk.
    db.totpRecoveryCode.deleteMany({ where: { userId } }),
    db.totpRecoveryCode.createMany({
      data: codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code) })),
    }),
    // Lewat SQL mentah supaya `updatedAt` tidak ikut maju — lihat catatan panjang
    // di writeTotpFields. Menyalakan 2FA tidak boleh menendang orang yang sedang
    // menyalakannya.
    db.$executeRaw`
      UPDATE \`User\`
      SET \`totpSecretEnc\` = ${secretEnc}, \`totpEnabledAt\` = ${new Date()}
      WHERE \`id\` = ${userId}
    `,
  ]);

  return codes;
}

export async function disableTwoFactor(userId: string): Promise<void> {
  await db.$transaction([
    db.totpRecoveryCode.deleteMany({ where: { userId } }),
    db.$executeRaw`
      UPDATE \`User\`
      SET \`totpSecretEnc\` = NULL, \`totpEnabledAt\` = NULL
      WHERE \`id\` = ${userId}
    `,
  ]);
}

/** Blob terenkripsi apa adanya, tanpa didekripsi — dipakai enableTwoFactor untuk menulis ulang tanpa mengubahnya. */
async function readRawSecretEnc(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { totpSecretEnc: true } });
  return typeof user?.totpSecretEnc === "string" ? user.totpSecretEnc : null;
}

/**
 * Cocokkan apa yang diketik saat login: kode autentikator ATAU kode pemulihan.
 *
 * Keduanya diterima di kolom yang sama supaya orang yang kehilangan HP tidak
 * perlu menemukan tombol tersembunyi lebih dulu — bentuknya sendiri sudah
 * membedakan (6 angka vs XXXX-XXXX).
 *
 * Kode pemulihan yang cocok langsung DITANDAI TERPAKAI sebelum fungsi ini
 * kembali. Kalau tidak, kode yang sama bisa dipakai berkali-kali dan seluruh
 * gunanya sebagai jalan darurat sekali-pakai hilang.
 */
export async function verifySecondFactor(userId: string, input: string): Promise<boolean> {
  const code = input.trim();
  if (code === "") return false;

  const secret = await readStagedSecret(userId);
  if (secret && verifyTotp(secret, code)) return true;

  const hash = hashRecoveryCode(code);
  // updateMany + syarat usedAt: null = klaim atomik. Dua percobaan bersamaan
  // dengan kode yang sama hanya bisa dimenangkan satu.
  const claimed = await db.totpRecoveryCode.updateMany({
    where: { userId, codeHash: hash, usedAt: null },
    data: { usedAt: new Date() },
  });
  return claimed.count === 1;
}
