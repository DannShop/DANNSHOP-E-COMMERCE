"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionMessage } from "@/components/action-feedback";

type ActionResult = { ok?: string; error?: string };

/**
 * Formulir reseller untuk orang yang SUDAH punya akun.
 *
 * Email ditampilkan tapi TERKUNCI, dan password tidak diminta sama sekali.
 * Keduanya sudah dimiliki orang ini; meminta ulang hanya membuka kemungkinan
 * salah ketik pada identitas yang sudah benar - dan email adalah identitas
 * login sekaligus tujuan link aktivasi, jadi salah ketik di situ termasuk yang
 * paling mahal (lihat catatan panjang di EmailChangeToken pada schema.prisma).
 */
export function ResellerJoinForm({
  email,
  action,
}: {
  email: string;
  action: (prev: ActionResult | undefined, formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined as ActionResult | undefined);

  if (state?.ok) {
    return (
      <div className="rounded-lg border p-4">
        <p className="text-sm text-emerald-700 dark:text-emerald-400">{state.ok}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          Buka emailnya dan klik tombol aktivasi. Sebelum diklik, akunmu belum berstatus reseller.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4 rounded-lg border p-4">
      <div className="space-y-1.5">
        <Label htmlFor="reseller-email">Email</Label>
        {/* Sengaja disabled + tanpa `name`: nilainya tidak perlu dikirim sama
            sekali, server memakai email sesi. Menampilkannya tetap penting
            supaya orangnya tahu ke mana link aktivasi akan dikirim. */}
        <Input id="reseller-email" value={email} disabled />
        <p className="text-xs text-muted-foreground">
          Link aktivasi dikirim ke alamat ini. Tidak bisa diubah di sini — ganti dulu di Pengaturan kalau
          alamatnya salah.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reseller-business">Nama usaha</Label>
        <Input id="reseller-business" name="businessName" required maxLength={80} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reseller-phone">Nomor WhatsApp</Label>
        <Input id="reseller-phone" name="phone" type="tel" inputMode="tel" required maxLength={20} />
        <p className="text-xs text-muted-foreground">
          Dipakai admin kalau ada yang perlu dikonfirmasi soal akunmu.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reseller-referral">Kode referral</Label>
        <Input id="reseller-referral" name="referralCode" maxLength={40} />
        <p className="text-xs text-muted-foreground">Opsional. Kosongkan kalau tidak punya.</p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Mendaftarkan..." : "Daftar Reseller"}
        </Button>
        <ActionMessage state={state ?? {}} />
      </div>
    </form>
  );
}
