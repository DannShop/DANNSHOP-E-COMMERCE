import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAdminAction, requireOwner } from "@/lib/auth/admin-gate";
import { isValidPermission, parsePermissions } from "@/lib/rbac/permissions";

export type ActionResult = { ok?: string; error?: string };

// Pengelolaan peran & karyawan.
//
// SEMUA aksi di berkas ini memakai requireOwner(), bukan requireAdminSession()
// dengan sebuah izin. Itu bukan kelalaian: kalau "kelola karyawan" jadi izin
// biasa, karyawan yang memegangnya bisa menambahkan izin apa pun ke perannya
// sendiri - termasuk refund - dan naik setara pemilik toko tanpa satu pun error
// yang menandainya. Kemampuan membagikan hak akses harus berhenti di pemilik.

const roleSchema = z.object({
  name: z.string().trim().min(2, "Nama peran minimal 2 karakter").max(40, "Nama peran maksimal 40 karakter"),
  description: z.string().trim().max(200, "Keterangan maksimal 200 karakter"),
  permissions: z.array(z.string()).transform((keys) => keys.filter(isValidPermission)),
});

function readRole(formData: FormData) {
  return {
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    // getAll: satu nama field, banyak centang - bentuk bawaan checkbox HTML.
    permissions: formData.getAll("permissions").map(String),
  };
}

export async function createStaffRole(formData: FormData): Promise<ActionResult> {
  "use server";
  const owner = await requireOwner();
  if ("error" in owner) return owner;

  const parsed = roleSchema.safeParse(readRole(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const existing = await db.staffRole.findUnique({ where: { name: parsed.data.name } });
  if (existing) return { error: "Sudah ada peran dengan nama itu." };

  const role = await db.staffRole.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      permissions: parsed.data.permissions,
    },
  });
  await logAdminAction(owner.adminId, "staff_role.create", "staff_role", role.id, {
    nama: role.name,
    izin: parsed.data.permissions,
  });

  revalidatePath("/admin/staff");
  return { ok: `Peran "${role.name}" dibuat.` };
}

export async function updateStaffRole(formData: FormData): Promise<ActionResult> {
  "use server";
  const owner = await requireOwner();
  if ("error" in owner) return owner;

  const roleId = formData.get("roleId");
  if (typeof roleId !== "string" || !roleId) return { error: "Peran tidak ditemukan." };

  const parsed = roleSchema.safeParse(readRole(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const before = await db.staffRole.findUnique({ where: { id: roleId } });
  if (!before) return { error: "Peran tidak ditemukan." };

  const clash = await db.staffRole.findUnique({ where: { name: parsed.data.name } });
  if (clash && clash.id !== roleId) return { error: "Sudah ada peran dengan nama itu." };

  await db.staffRole.update({
    where: { id: roleId },
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      permissions: parsed.data.permissions,
      isActive: formData.get("isActive") === "on",
    },
  });

  // Izin SEBELUM dan SESUDAH dicatat dua-duanya. Log yang cuma menyimpan hasil
  // akhir tidak bisa menjawab pertanyaan yang benar-benar ditanyakan setelah
  // ada masalah: "siapa yang menambahkan izin refund, dan kapan".
  await logAdminAction(owner.adminId, "staff_role.update", "staff_role", roleId, {
    nama: parsed.data.name,
    izinSebelum: parsePermissions(before.permissions),
    izinSesudah: parsed.data.permissions,
  });

  revalidatePath("/admin/staff");
  return { ok: "Peran diperbarui. Perubahan izin langsung berlaku, tanpa perlu karyawannya login ulang." };
}

export async function deleteStaffRole(formData: FormData): Promise<ActionResult> {
  "use server";
  const owner = await requireOwner();
  if ("error" in owner) return owner;

  const roleId = formData.get("roleId");
  if (typeof roleId !== "string" || !roleId) return { error: "Peran tidak ditemukan." };

  const role = await db.staffRole.findUnique({
    where: { id: roleId },
    select: { name: true, _count: { select: { users: true } } },
  });
  if (!role) return { error: "Peran tidak ditemukan." };

  // Karyawannya TIDAK ikut terhapus (FK-nya ON DELETE SET NULL), tapi menghapus
  // peran yang masih dipakai membuat mereka kehilangan seluruh izin sekaligus
  // tanpa peringatan. Lebih baik ditolak dan admin memindahkannya dulu.
  if (role._count.users > 0) {
    return {
      error: `Peran ini masih dipakai ${role._count.users} karyawan. Pindahkan mereka ke peran lain dulu, atau nonaktifkan perannya.`,
    };
  }

  await db.staffRole.delete({ where: { id: roleId } });
  await logAdminAction(owner.adminId, "staff_role.delete", "staff_role", roleId, { nama: role.name });

  revalidatePath("/admin/staff");
  return { ok: `Peran "${role.name}" dihapus.` };
}

/**
 * Mengangkat seorang user jadi karyawan, atau memindahkan perannya.
 *
 * Dimulai dari akun yang SUDAH ADA, bukan membuat akun baru: karyawan mendaftar
 * sendiri lewat form daftar biasa (dengan emailnya sendiri, password yang tidak
 * pernah kita lihat), lalu diangkat di sini. Membuat akun berikut passwordnya di
 * panel berarti pemilik toko pernah memegang password karyawannya - dan itu
 * menghapus arti setiap jejak audit yang mencatat "dilakukan oleh karyawan X".
 */
export async function assignStaffRole(formData: FormData): Promise<ActionResult> {
  "use server";
  const owner = await requireOwner();
  if ("error" in owner) return owner;

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const roleId = formData.get("roleId");
  if (!email) return { error: "Email karyawan wajib diisi." };
  if (typeof roleId !== "string" || !roleId) return { error: "Pilih peran dulu." };

  const [user, role] = await Promise.all([
    db.user.findUnique({ where: { email }, select: { id: true, role: true, email: true } }),
    db.staffRole.findUnique({ where: { id: roleId }, select: { id: true, name: true } }),
  ]);
  if (!user) return { error: "Tidak ada akun dengan email itu. Minta dia mendaftar lebih dulu." };
  if (!role) return { error: "Peran tidak ditemukan." };
  // Pemilik toko tidak boleh diturunkan jadi karyawan lewat jalur ini - itu cara
  // paling mudah mengunci diri sendiri di luar panel tanpa jalan kembali.
  if (user.role === "ADMIN") return { error: "Akun ini pemilik toko, tidak bisa dijadikan karyawan." };

  await db.user.update({ where: { id: user.id }, data: { role: "STAFF", staffRoleId: role.id } });
  await logAdminAction(owner.adminId, "staff.assign", "user", user.id, {
    email: user.email,
    peran: role.name,
  });

  revalidatePath("/admin/staff");
  // Menulis ke tabel User menaikkan updatedAt, dan proxy.ts menendang sesi yang
  // updatedAt-nya tidak cocok lagi. Di sini itu justru yang DIINGINKAN: hak
  // akses yang berubah harus berlaku seketika, bukan setelah tokennya habis.
  return { ok: `${user.email} sekarang karyawan dengan peran "${role.name}". Dia perlu login ulang.` };
}

export async function revokeStaff(formData: FormData): Promise<ActionResult> {
  "use server";
  const owner = await requireOwner();
  if ("error" in owner) return owner;

  const userId = formData.get("userId");
  if (typeof userId !== "string" || !userId) return { error: "Karyawan tidak ditemukan." };

  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, role: true } });
  if (!user) return { error: "Karyawan tidak ditemukan." };
  if (user.role !== "STAFF") return { error: "Akun ini bukan karyawan." };

  // Dikembalikan jadi USER biasa, BUKAN dihapus. Akunnya bisa saja punya riwayat
  // pesanan sendiri, dan jejak AdminActionLog-nya harus tetap menunjuk ke
  // seseorang yang masih ada.
  await db.user.update({ where: { id: userId }, data: { role: "USER", staffRoleId: null } });
  await logAdminAction(owner.adminId, "staff.revoke", "user", userId, { email: user.email });

  revalidatePath("/admin/staff");
  return { ok: `Akses panel untuk ${user.email} dicabut. Sesinya berakhir seketika.` };
}
