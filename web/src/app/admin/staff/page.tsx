import { db } from "@/lib/db";
import { parsePermissions } from "@/lib/rbac/permissions";
import {
  assignStaffRole,
  createStaffRole,
  deleteStaffRole,
  revokeStaff,
  updateStaffRole,
} from "@/app/actions/staff";
import { RoleManager } from "./role-manager";
import { StaffManager } from "./staff-manager";

// Karyawan & Peran. HANYA pemilik toko (role ADMIN) yang bisa membukanya —
// ditegakkan proxy.ts lewat aturan `adminOnly` di lib/rbac/access.ts, bukan oleh
// halaman ini. Alasan kenapa ini tidak boleh jadi izin biasa ada di
// lib/rbac/permissions.ts: siapa pun yang bisa membagi izin bisa mengangkat
// dirinya sendiri.

export default async function StaffPage() {
  const [roles, staff] = await Promise.all([
    db.staffRole.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        permissions: true,
        isActive: true,
        _count: { select: { users: true } },
      },
    }),
    db.user.findMany({
      where: { role: "STAFF" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        totpEnabledAt: true,
        staffRole: { select: { id: true, name: true, isActive: true } },
      },
    }),
  ]);

  const roleList = roles.map((role) => ({
    id: role.id,
    name: role.name,
    description: role.description,
    permissions: parsePermissions(role.permissions),
    isActive: role.isActive,
    userCount: role._count.users,
  }));

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Karyawan &amp; Peran</h1>
        <p className="text-sm text-muted-foreground">
          Beri karyawan akses ke bagian panel yang jadi tanggung jawabnya saja. Halaman ini hanya bisa
          dibuka olehmu sebagai pemilik toko — karyawan tidak bisa mengubah izinnya sendiri maupun izin
          temannya.
        </p>
      </div>

      <StaffManager
        staff={staff.map((s) => ({
          id: s.id,
          name: s.name,
          email: s.email,
          hasTwoFactor: s.totpEnabledAt !== null,
          roleName: s.staffRole?.name ?? null,
          roleIsActive: s.staffRole?.isActive ?? false,
        }))}
        roles={roleList.map((r) => ({ id: r.id, name: r.name, isActive: r.isActive }))}
        assignAction={assignStaffRole}
        revokeAction={revokeStaff}
      />

      <RoleManager
        roles={roleList}
        createAction={createStaffRole}
        updateAction={updateStaffRole}
        deleteAction={deleteStaffRole}
      />

      <div className="rounded-lg border border-dashed p-4">
        <h2 className="text-sm font-semibold">Cara menambah karyawan</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs text-muted-foreground">
          <li>
            Minta calon karyawan <strong className="font-semibold text-foreground">mendaftar sendiri</strong> di
            halaman daftar toko, memakai emailnya sendiri. Passwordnya tidak pernah kamu pegang — itu
            yang membuat catatan &quot;dilakukan oleh karyawan X&quot; punya arti.
          </li>
          <li>Buat peran di bawah, centang bagian yang jadi tanggung jawabnya.</li>
          <li>Masukkan emailnya di kolom di atas, pilih perannya, simpan.</li>
          <li>
            Dia <strong className="font-semibold text-foreground">wajib memasang 2FA</strong> saat pertama masuk
            panel — sama seperti kamu, tanpa kecuali.
          </li>
        </ol>
      </div>
    </div>
  );
}
