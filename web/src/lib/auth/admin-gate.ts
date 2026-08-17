import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission, type AdminViewer, type UserRole } from "@/lib/rbac/access";
import { parsePermissions, type Permission } from "@/lib/rbac/permissions";

// SATU gerbang untuk seluruh panel admin.
//
// ⚠️ BACA INI SEBELUM MENYALIN FUNGSINYA KE BERKAS LAIN.
//
// Sebelumnya `requireAdmin` ada dalam 16 SALINAN terpisah di app/actions/*.ts,
// dan salinan-salinannya sudah mulai berbeda satu sama lain. Komentar di sana
// menyebut duplikasi itu perlu karena "berkas 'use server' hanya boleh
// mengekspor async function" - alasan itu KELIRU untuk kasus ini: berkas-berkas
// itu menaruh "use server" di dalam BADAN fungsi, jadi modulnya modul biasa dan
// bebas mengimpor apa saja. (Bahkan pada berkas "use server" tingkat-modul,
// yang dibatasi adalah apa yang boleh DIEKSPOR, bukan apa yang boleh diimpor.)
//
// Kenapa duplikasinya berbahaya, bukan cuma tidak rapi: Server Action adalah
// endpoint HTTP. Satu salinan yang ketinggalan diperbarui berarti aksi itu
// masih bisa dipanggil langsung oleh siapa pun yang seharusnya tidak berhak -
// tanpa satu pun error, tanpa satu pun tanda di layar.

export interface AdminSession extends AdminViewer {
  adminId: string;
}

export type AdminGateResult = AdminSession | { error: string };

/**
 * Pesan penolakan SENGAJA seragam untuk semua sebab (bukan admin, sesi basi,
 * akun ditangguhkan, izin kurang). Membedakannya cuma memberi tahu penebak
 * sejauh mana tebakannya benar.
 */
const DENIED = { error: "Tidak diizinkan" } as const;

/**
 * Siapa yang sedang memanggil, dibaca SEGAR dari database.
 *
 * Peran & izin TIDAK diambil dari JWT. JWT di sini stateless dan berumur
 * panjang, jadi token yang terbit sebelum izinnya dicabut akan terus membawa
 * izin lama sampai kedaluwarsa. Pola yang sama sudah dipakai penegakan ban dan
 * penegakan 2FA - satu-satunya sumber kebenaran adalah baris User saat ini.
 *
 * `updatedAt` tetap dibandingkan dengan JWT (penegakan ban & pencabutan sesi),
 * dan `bannedAt` ikut dicek langsung: salah satu route API sebelumnya memeriksa
 * `bannedAt` sementara yang lain memeriksa `updatedAt` - sekarang keduanya.
 */
export async function requireAdminSession(permission?: Permission): Promise<AdminGateResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || !session?.user?.role) return DENIED;

  const fresh = await db.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      updatedAt: true,
      bannedAt: true,
      staffRole: { select: { permissions: true, isActive: true } },
    },
  });
  if (!fresh || fresh.bannedAt) return DENIED;
  if (fresh.updatedAt.getTime() !== session.user.updatedAt) return DENIED;
  if (fresh.role !== "ADMIN" && fresh.role !== "STAFF") return DENIED;

  // Peran yang dinonaktifkan langsung menghapus izinnya, tanpa perlu melepas
  // penugasannya dari tiap karyawan satu per satu. Itu gunanya tombol nonaktif:
  // mencabut akses seketika saat ada yang mencurigakan.
  const permissions =
    fresh.staffRole && fresh.staffRole.isActive ? parsePermissions(fresh.staffRole.permissions) : [];

  const viewer: AdminSession = {
    adminId: userId,
    role: fresh.role as UserRole,
    permissions,
  };

  if (permission && !hasPermission(viewer, permission)) return DENIED;
  return viewer;
}

/**
 * Gerbang untuk hal yang TIDAK BOLEH didelegasikan ke karyawan mana pun.
 *
 * Dipakai pengelolaan peran & karyawan. Kalau itu jadi izin biasa, karyawan
 * yang memegangnya bisa menaikkan izinnya sendiri sampai setara pemilik toko.
 */
export async function requireOwner(): Promise<AdminGateResult> {
  const result = await requireAdminSession();
  if ("error" in result) return result;
  return result.role === "ADMIN" ? result : DENIED;
}

/** Mencatat tindakan admin. Satu bentuk untuk semua pemanggil. */
export async function logAdminAction(
  adminId: string,
  action: string,
  targetType: string,
  targetId?: string,
  detail?: object,
): Promise<void> {
  await db.adminActionLog.create({ data: { adminId, action, targetType, targetId, detail } });
}
