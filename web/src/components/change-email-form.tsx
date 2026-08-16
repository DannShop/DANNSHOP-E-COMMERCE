"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

/**
 * Form ganti email - langkah 1 dari 2.
 *
 * SENGAJA TIDAK melogout setelah sukses, berbeda dari ChangePasswordForm.
 * Submit di sini belum mengubah apa pun pada akun; yang terjadi cuma satu link
 * konfirmasi terkirim ke alamat baru. Melogout di sini akan mengusir orangnya
 * dari sesi yang masih sah sepenuhnya, untuk perubahan yang mungkin tidak pernah
 * dia selesaikan.
 */
export function ChangeEmailForm({
  action,
  idPrefix,
  currentEmail,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  /** Pembeda id input kalau ada lebih dari satu form di satu halaman. */
  idPrefix: string;
  currentEmail: string;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );

  // Setelah link terkirim, form dikunci: mengirim ulang cuma akan membatalkan
  // link yang barusan masuk ke inbox (permintaan baru menghapus yang lama) dan
  // membuat orangnya mengklik link mati.
  const terkirim = Boolean(state.ok);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-current-email`}>Email Sekarang</Label>
        <Input id={`${idPrefix}-current-email`} value={currentEmail} readOnly disabled />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-new-email`}>Email Baru</Label>
        <Input
          id={`${idPrefix}-new-email`}
          name="newEmail"
          type="email"
          autoComplete="email"
          required
          disabled={pending || terkirim}
        />
        <p className="text-xs text-muted-foreground">
          Pastikan alamat ini benar dan bisa kamu buka — link konfirmasinya dikirim ke sana.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-email-password`}>Password Saat Ini</Label>
        <Input
          id={`${idPrefix}-email-password`}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending || terkirim}
        />
      </div>

      <Button type="submit" disabled={pending || terkirim} className="self-start">
        {pending ? "Mengirim..." : "Kirim Link Konfirmasi"}
      </Button>

      {(state.ok || state.error) && (
        <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
