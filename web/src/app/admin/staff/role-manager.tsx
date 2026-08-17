"use client";

import { useActionState, useState } from "react";
import { ActionMessage } from "@/components/action-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { groupedPermissions, type Permission } from "@/lib/rbac/permissions";

type ActionResult = { ok?: string; error?: string };
const INITIAL: ActionResult = {};

export interface StaffRoleView {
  id: string;
  name: string;
  description: string | null;
  permissions: Permission[];
  isActive: boolean;
  userCount: number;
}

/** Daftar centang izin, dikelompokkan sama seperti menu sidebar. */
function PermissionPicker({ selected }: { selected: Permission[] }) {
  return (
    <div className="space-y-4">
      {groupedPermissions().map((group) => (
        <fieldset key={group.group} className="space-y-2">
          <legend className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {group.group}
          </legend>
          {group.items.map((perm) => (
            <label key={perm.key} className="flex items-start gap-2.5">
              <Checkbox name="permissions" value={perm.key} defaultChecked={selected.includes(perm.key)} />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {perm.label}
                  {/* Izin yang menyentuh uang atau akun orang lain ditandai.
                      Tanpa penanda, "Kelola pesanan" dan "Refund" terbaca sama
                      pentingnya saat dicentang buru-buru. */}
                  {perm.sensitive && <Badge variant="warning">sensitif</Badge>}
                </span>
                <span className="block text-xs text-muted-foreground">{perm.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

function RoleForm({
  role,
  action,
  onDone,
}: {
  role?: StaffRoleView;
  action: (formData: FormData) => Promise<ActionResult>;
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => {
      const result = await action(formData);
      if (result.ok) onDone?.();
      return result;
    },
    INITIAL,
  );

  return (
    <form action={formAction} className="space-y-4">
      {role && <input type="hidden" name="roleId" value={role.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`role-name-${role?.id ?? "baru"}`}>Nama peran</Label>
          <Input
            id={`role-name-${role?.id ?? "baru"}`}
            name="name"
            defaultValue={role?.name ?? ""}
            placeholder="mis. Operator Order"
            maxLength={40}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`role-desc-${role?.id ?? "baru"}`}>Keterangan</Label>
          <Input
            id={`role-desc-${role?.id ?? "baru"}`}
            name="description"
            defaultValue={role?.description ?? ""}
            placeholder="Opsional"
            maxLength={200}
          />
        </div>
      </div>

      <PermissionPicker selected={role?.permissions ?? []} />

      {role && (
        <label className="flex items-center gap-2.5">
          <Checkbox name="isActive" defaultChecked={role.isActive} />
          <span className="text-sm">
            Peran aktif
            <span className="block text-xs text-muted-foreground">
              Dimatikan = seluruh karyawan yang memakainya kehilangan izin seketika, tanpa perlu
              dilepas satu per satu.
            </span>
          </span>
        </label>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan..." : role ? "Simpan perubahan" : "Buat peran"}
        </Button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

export function RoleManager({
  roles,
  createAction,
  updateAction,
  deleteAction,
}: {
  roles: StaffRoleView[];
  createAction: (formData: FormData) => Promise<ActionResult>;
  updateAction: (formData: FormData) => Promise<ActionResult>;
  deleteAction: (formData: FormData) => Promise<ActionResult>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteState, remove, removing] = useActionState(
    (_prev: ActionResult, formData: FormData) => deleteAction(formData),
    INITIAL,
  );

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Peran</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Satu peran = satu kumpulan izin yang bisa dipakai ulang untuk beberapa karyawan.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setCreating((v) => !v)}>
          {creating ? "Batal" : "Buat peran"}
        </Button>
      </div>

      {creating && (
        <div className="mt-4 rounded-lg border border-dashed p-4">
          {/* key memaksa form dipasang ulang setelah berhasil, supaya isian
              sebelumnya tidak tertinggal saat membuat peran kedua. */}
          <RoleForm key="baru" action={createAction} onDone={() => setCreating(false)} />
        </div>
      )}

      <ActionMessage state={deleteState} />

      <ul className="mt-4 divide-y">
        {roles.length === 0 && (
          <li className="py-3 text-xs text-muted-foreground">Belum ada peran.</li>
        )}
        {roles.map((role) => (
          <li key={role.id} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {role.name}
                  {!role.isActive && <Badge variant="warning">nonaktif</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {role.permissions.length} izin · {role.userCount} karyawan
                  {role.description ? ` · ${role.description}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setEditing((cur) => (cur === role.id ? null : role.id))}
                >
                  {editing === role.id ? "Tutup" : "Ubah"}
                </Button>
                <form action={remove}>
                  <input type="hidden" name="roleId" value={role.id} />
                  <Button type="submit" variant="outline" size="xs" disabled={removing}>
                    Hapus
                  </Button>
                </form>
              </div>
            </div>

            {editing === role.id && (
              <div className="mt-4 rounded-lg border border-dashed p-4">
                <RoleForm role={role} action={updateAction} onDone={() => setEditing(null)} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
