"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { confirmEmailChangeAction } from "@/app/actions/account";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

/**
 * Tombol konfirmasi, bukan konfirmasi otomatis saat halaman dibuka.
 *
 * Perubahan email adalah perubahan keadaan, dan mengerjakannya di GET berarti
 * siapa pun yang cuma MEMBUKA URL-nya sudah menjalankannya - termasuk pemindai
 * tautan milik penyedia email dan pratinjau tautan, yang rutin mengambil setiap
 * URL di dalam pesan sebelum manusianya sempat melihatnya. Token sekali pakai
 * itu akan terbakar sebelum sampai ke orangnya, dan yang tersisa cuma link mati.
 */
export function ConfirmEmailForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => confirmEmailChangeAction(formData),
    INITIAL_STATE,
  );

  if (state.ok) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-emerald-700">{state.ok}</p>
        <Link href="/login" className={cn(buttonVariants(), "h-11 w-full rounded-xl text-[0.9375rem]")}>
          Masuk dengan Email Baru
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <Button type="submit" disabled={pending} className="h-11 w-full rounded-xl text-[0.9375rem]">
        {pending ? "Memproses..." : "Konfirmasi Email Baru"}
      </Button>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
