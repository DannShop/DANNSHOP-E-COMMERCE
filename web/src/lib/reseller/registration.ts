import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { emailField } from "@/lib/validation/auth";

// Pendaftaran program reseller.
//
// DUA PINTU, satu jalur:
//   - publik: orang yang belum punya akun sama sekali, mengisi email & password
//   - dari dalam akun: email & password TIDAK diminta lagi (sudah dimiliki)
// Keduanya berakhir sama: sebuah ResellerAccount yang BELUM aktif, plus satu
// link aktivasi yang dikirim ke email.

/** Umur link aktivasi. Sama dengan token pemulihan lain di repo ini. */
export const ACTIVATION_TTL_MS = 30 * 60_000;

const businessFields = {
  businessName: z.string().trim().min(2, "Nama usaha minimal 2 karakter").max(80, "Nama usaha maksimal 80 karakter"),
  // Nomor HP tidak divalidasi ketat ke format Indonesia: penulisan yang dipakai
  // orang berbeda-beda (08xx, +628xx, spasi, strip) dan menolak yang benar
  // hanya karena bentuknya lebih merugikan daripada menerima yang aneh.
  phone: z.string().trim().min(8, "Nomor HP minimal 8 digit").max(20, "Nomor HP maksimal 20 karakter"),
  referralCode: z.string().trim().max(40, "Kode referral maksimal 40 karakter"),
};

export const publicRegisterSchema = z.object({
  name: z.string().trim().min(2, "Nama lengkap minimal 2 karakter").max(60, "Nama lengkap maksimal 60 karakter"),
  email: emailField,
  password: z.string().min(8, "Password minimal 8 karakter").max(72, "Password maksimal 72 karakter"),
  ...businessFields,
});

/** Dari dalam akun: identitas login tidak ikut, karena sudah dimiliki. */
export const accountRegisterSchema = z.object(businessFields);

export function hashActivationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Menerbitkan token aktivasi baru.
 *
 * Token lama milik user yang sama DIBUANG lebih dulu. Kalau tidak, orang yang
 * menekan "kirim ulang" beberapa kali meninggalkan beberapa link hidup
 * sekaligus, dan yang paling lama beredar justru yang paling mungkin sudah
 * bocor lewat riwayat email yang diteruskan.
 */
export async function issueActivationToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await db.$transaction([
    db.resellerActivationToken.deleteMany({ where: { userId } }),
    db.resellerActivationToken.create({
      data: {
        userId,
        tokenHash: hashActivationToken(token),
        expiresAt: new Date(Date.now() + ACTIVATION_TTL_MS),
      },
    }),
  ]);
  return token;
}

export type ActivationResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

/**
 * Menukar token jadi akun reseller yang aktif.
 *
 * Klaim atomiknya ada di `updateMany ... where usedAt: null`: dua klik pada
 * link yang sama (pemindai tautan milik penyedia email + manusianya) hanya bisa
 * dimenangkan satu. Yang kalah TIDAK diperlakukan sebagai kegagalan kalau
 * akunnya memang sudah aktif — lihat cabang di bawah.
 */
export async function activateReseller(rawToken: string): Promise<ActivationResult> {
  const token = rawToken.trim();
  if (!token) return { ok: false, error: "Link aktivasi tidak lengkap." };

  const row = await db.resellerActivationToken.findUnique({
    where: { tokenHash: hashActivationToken(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });
  if (!row) return { ok: false, error: "Link aktivasi tidak dikenali. Mungkin sudah diganti link yang lebih baru." };

  if (row.usedAt) {
    // Sudah dipakai. Kalau akunnya memang sudah aktif, ini bukan kegagalan -
    // orangnya cuma mengklik link yang sama dua kali, dan menampilkan pesan
    // galat di situ membuatnya mengira pendaftarannya batal.
    const reseller = await db.resellerAccount.findUnique({
      where: { userId: row.userId },
      select: { activatedAt: true },
    });
    if (reseller?.activatedAt) return { ok: true, userId: row.userId };
    return { ok: false, error: "Link aktivasi sudah dipakai." };
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, error: "Link aktivasi sudah kedaluwarsa. Minta link baru dari halaman akunmu." };
  }

  const claimed = await db.resellerActivationToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) return { ok: false, error: "Link aktivasi sudah dipakai." };

  await db.resellerAccount.update({
    where: { userId: row.userId },
    data: { activatedAt: new Date() },
  });

  // Email pendaftar terbukti benar-benar bisa dibuka olehnya. Untuk akun yang
  // lahir dari form publik, inilah satu-satunya verifikasi email yang pernah
  // terjadi - jadi ditandai sekalian di sini.
  await db.user.updateMany({
    where: { id: row.userId, emailVerifiedAt: null },
    data: { emailVerifiedAt: new Date() },
  });

  return { ok: true, userId: row.userId };
}

/**
 * Membuat akun user BARU untuk pendaftar publik.
 *
 * Dipisah supaya jalur "sudah punya akun" tidak pernah menyentuhnya. Wallet
 * ikut dibuat di transaksi yang sama, sama seperti registerAction - akun tanpa
 * wallet akan meledak di titik pertama yang membaca saldo, jauh dari sini.
 */
export async function createResellerUser(input: {
  name: string;
  email: string;
  password: string;
  businessName: string;
  phone: string;
  referralCode: string;
}): Promise<string> {
  const passwordHash = await hashPassword(input.password);
  return db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: input.name, email: input.email, passwordHash },
    });
    await tx.wallet.create({ data: { userId: user.id } });
    await tx.resellerAccount.create({
      data: {
        userId: user.id,
        businessName: input.businessName,
        phone: input.phone,
        referralCode: input.referralCode || null,
      },
    });
    return user.id;
  });
}
