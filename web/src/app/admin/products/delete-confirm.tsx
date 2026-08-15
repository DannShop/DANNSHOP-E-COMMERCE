"use client";

import { type ReactElement, type ReactNode, useActionState } from "react";
import { Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ActionMessage, INITIAL_STATE, withPrevState } from "./action-utils";
import type { ServerAction } from "./action-utils";

/**
 * Konfirmasi hapus, dipakai ketiga titik (produk, satu item, item terpilih).
 *
 * Pakai Dialog, BUKAN `window.confirm`: dialog bawaan browser memblokir seluruh
 * halaman, tidak bisa memuat rincian apa pun, dan tampilannya terputus total dari
 * sisa panel. Yang paling menentukan, dia cuma bisa bertanya "yakin?" — padahal
 * pertanyaan yang benar adalah "yakin, mengetahui bahwa yang hilang ini-itu",
 * dan rincian itulah yang membuat orang berhenti sebelum menghapus yang salah.
 *
 * Aksinya diteruskan lewat props dari Server Component, pola yang sama dengan
 * seluruh form di fitur ini (lihat catatan di action-utils.tsx).
 */
export function DeleteConfirm({
  action,
  trigger,
  title,
  description,
  confirmLabel = "Hapus",
  hiddenFields,
  children,
}: {
  action: ServerAction;
  /** ReactElement, bukan ReactNode: `render` milik Base UI mengkloning elemennya
   *  untuk menempelkan props pemicu — teks telanjang atau null tidak bisa dikloning. */
  trigger: ReactElement;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  /** Nilai yang ikut terkirim, mis. { id: "..." }. */
  hiddenFields: Record<string, string>;
  /** Field tambahan berbentuk elemen, mis. daftar <input name="itemIds"> berulang. */
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(withPrevState(action), INITIAL_STATE);

  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent title={title} className="max-w-md">
        <form action={formAction} className="space-y-4">
          {Object.entries(hiddenFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {children}

          <div className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
            <div className="space-y-1 text-foreground/85">{description}</div>
          </div>

          <p className="text-xs text-muted-foreground">
            Riwayat order yang sudah tuntas tetap utuh — nama produk, nama item, dan harganya sudah tersimpan di
            ordernya masing-masing.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="destructive" size="sm" disabled={pending}>
              <Trash2 className="size-4" aria-hidden="true" />
              {pending ? "Menghapus..." : confirmLabel}
            </Button>
            <DialogClose
              render={
                <Button type="button" variant="outline" size="sm">
                  Batal
                </Button>
              }
            />
          </div>
          {/* Pesan penolakan penjaga muncul DI SINI, di dalam dialog — kalimatnya
              memuat nomor order yang menghalangi, dan itu tidak boleh hilang
              bersama dialog yang tertutup. */}
          <ActionMessage state={state} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
