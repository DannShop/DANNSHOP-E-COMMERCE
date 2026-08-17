"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { activateResellerAction } from "@/app/actions/reseller-activate";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

/**
 * Tombol, bukan aktivasi otomatis saat halaman dibuka.
 *
 * Aktivasi mengubah keadaan, dan mengerjakannya saat halaman dimuat berarti
 * siapa pun yang cuma MEMBUKA URL-nya sudah menjalankannya — termasuk pemindai
 * tautan milik penyedia email, yang rutin mengambil setiap URL di dalam pesan
 * sebelum manusianya sempat melihat. Token sekali pakai itu akan terbakar
 * sebelum sampai ke orangnya. Alasan & pola sama dengan /konfirmasi-email.
 */
export function ActivateResellerForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => activateResellerAction(formData),
    INITIAL_STATE,
  );

  if (state.ok) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-emerald-700 dark:text-emerald-400">{state.ok}</p>
        <Link
          href="/account/reseller"
          className={cn(buttonVariants(), "h-11 w-full rounded-xl text-[0.9375rem]")}
        >
          Buka Menu Reseller
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {state.error && (
        <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-11 w-full rounded-xl text-[0.9375rem]">
        {pending ? "Mengaktifkan..." : "Aktifkan Akun Reseller"}
      </Button>
    </form>
  );
}
