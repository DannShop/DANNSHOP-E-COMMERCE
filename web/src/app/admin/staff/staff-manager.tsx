"use client";

import { useActionState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { ActionMessage } from "@/components/action-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ActionResult = { ok?: string; error?: string };
const INITIAL: ActionResult = {};

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  hasTwoFactor: boolean;
  roleName: string | null;
  roleIsActive: boolean;
}

export function StaffManager({
  staff,
  roles,
  assignAction,
  revokeAction,
}: {
  staff: StaffMember[];
  roles: { id: string; name: string; isActive: boolean }[];
  assignAction: (formData: FormData) => Promise<ActionResult>;
  revokeAction: (formData: FormData) => Promise<ActionResult>;
}) {
  const [assignState, assign, assigning] = useActionState(
    (_prev: ActionResult, formData: FormData) => assignAction(formData),
    INITIAL,
  );
  const [revokeState, revoke, revoking] = useActionState(
    (_prev: ActionResult, formData: FormData) => revokeAction(formData),
    INITIAL,
  );

  // Peran nonaktif sengaja tidak bisa dipilih untuk penugasan BARU, tapi yang
  // sudah terlanjur memakainya tetap ditampilkan apa adanya di daftar - dengan
  // penanda, karena izinnya sudah nol sejak perannya dimatikan.
  const assignable = roles.filter((r) => r.isActive);

  return (
    <div className="rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Karyawan</h2>
      <p className="mt-1 mb-4 text-xs text-muted-foreground">
        Akun yang sudah terdaftar di toko, diangkat jadi karyawan. Mengubah atau mencabut peran berlaku
        seketika — sesi yang sedang berjalan langsung berakhir.
      </p>

      <form action={assign} className="flex flex-wrap items-end gap-3 border-b pb-4">
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor="staff-email">Email akun</Label>
          <Input
            id="staff-email"
            name="email"
            type="email"
            placeholder="karyawan@email.com"
            required
          />
        </div>
        <div className="min-w-44 space-y-1.5">
          <Label htmlFor="staff-role">Peran</Label>
          <select
            id="staff-role"
            name="roleId"
            required
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
          >
            <option value="">Pilih peran...</option>
            {assignable.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={assigning || assignable.length === 0}>
          {assigning ? "Menyimpan..." : "Angkat jadi karyawan"}
        </Button>
      </form>

      {assignable.length === 0 && (
        <p className="pt-3 text-xs text-muted-foreground">
          Belum ada peran aktif. Buat perannya dulu di bawah.
        </p>
      )}
      <ActionMessage state={assignState} />
      <ActionMessage state={revokeState} />

      <ul className="mt-4 divide-y">
        {staff.length === 0 && (
          <li className="py-3 text-xs text-muted-foreground">Belum ada karyawan.</li>
        )}
        {staff.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{member.name}</p>
              <p className="truncate text-xs text-muted-foreground">{member.email}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {member.roleName ? (
                <Badge variant={member.roleIsActive ? "default" : "warning"}>
                  {member.roleName}
                  {!member.roleIsActive && " (nonaktif)"}
                </Badge>
              ) : (
                <Badge variant="warning">Tanpa peran</Badge>
              )}

              {/* 2FA ditampilkan karena gerbangnya memaksa karyawan memasangnya
                  sebelum bisa ke mana-mana. Karyawan yang tersangkut di langkah
                  itu terlihat seperti "akunnya tidak jalan", dan tanpa penanda
                  ini kamu tidak punya cara melihat sebabnya dari sini. */}
              {member.hasTwoFactor ? (
                <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                  <ShieldCheck className="size-3.5" aria-hidden="true" /> 2FA aktif
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                  <ShieldAlert className="size-3.5" aria-hidden="true" /> Belum pasang 2FA
                </span>
              )}

              <form action={revoke}>
                <input type="hidden" name="userId" value={member.id} />
                <Button type="submit" variant="outline" size="xs" disabled={revoking}>
                  Cabut akses
                </Button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
