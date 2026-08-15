"use client";

import { type ReactElement, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Konfirmasi sebelum aksi yang sulit dibatalkan.
 *
 * Menggantikan `window.confirm`, dan alasannya bukan estetika. Dialog bawaan
 * browser memblokir seluruh halaman, tampilannya terputus dari sisa panel, dan
 * yang paling menentukan: dia cuma bisa memuat SATU BARIS TEKS. Sebelas titik
 * konfirmasi di aplikasi ini karena itu terpaksa berbunyi "Yakin hapus X?" tanpa
 * bisa menyebutkan apa yang sebenarnya akan hilang — padahal justru rincian itu
 * yang membuat orang berhenti sebelum menekan hal yang salah.
 *
 * KENAPA `formId`, bukan ref atau callback: isi dialog di-render lewat PORTAL,
 * jadi di DOM dia berada di luar `<form>` pemanggilnya. Tombol `type="submit"`
 * di sana tidak akan men-submit apa pun. Atribut `form="<id>"` adalah cara HTML
 * baku menghubungkan tombol ke form yang bukan induknya — jadi form pemanggil
 * tetap memegang seluruh state-nya sendiri (useActionState, pesan hasil, status
 * pending) persis seperti sebelum ada dialog ini, dan yang berubah cuma "kapan
 * submit terjadi".
 */
export function ConfirmSubmit({
  formId,
  trigger,
  title,
  description,
  confirmLabel,
  tone = "danger",
}: {
  /** `id` dari <form> yang akan disubmit saat dikonfirmasi. */
  formId: string;
  /** ReactElement, bukan ReactNode: Base UI mengkloning elemennya untuk menempelkan props pemicu. */
  trigger: ReactElement;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "normal";
}) {
  const danger = tone === "danger";

  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent title={title} className="max-w-md">
        <div className="space-y-4">
          <div
            className={cn(
              "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm",
              danger ? "border-destructive/40 bg-destructive/10" : "border-sky-500/40 bg-sky-500/10",
            )}
          >
            <TriangleAlert
              className={cn("mt-0.5 size-4 shrink-0", danger ? "text-destructive" : "text-sky-600 dark:text-sky-400")}
              aria-hidden="true"
            />
            <div className="space-y-1 text-foreground/85">{description}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DialogClose
              render={
                <Button type="submit" form={formId} size="sm" variant={danger ? "destructive" : "default"}>
                  {confirmLabel}
                </Button>
              }
            />
            <DialogClose
              render={
                <Button type="button" size="sm" variant="outline">
                  Batal
                </Button>
              }
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
