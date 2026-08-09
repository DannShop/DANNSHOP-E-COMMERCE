"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

// Muat ulang DATA halaman tanpa memuat ulang seluruh browser.
//
// KENAPA TOMBOL INI HARUS ADA. Panel admin sengaja mengunci scroll dokumen
// (h-dvh + overflow-hidden + overscroll-behavior:none, lihat AdminShell) supaya
// overscroll tidak menyingkap <body> polos di balik shell. Efek sampingnya:
// **pull-to-refresh bawaan browser ikut mati di mobile** - tarik-ke-bawah tidak
// me-refresh apa pun, padahal halaman admin penuh data yang cepat basi (status
// order, saldo provider, log). Tombol ini mengembalikan kemampuan itu tanpa
// membongkar penguncian scroll.
//
// router.refresh(), BUKAN location.reload(): server component di-fetch ulang
// lalu hasilnya ditambal ke halaman yang sedang tampil, jadi posisi scroll,
// isian form, dan state komponen klien (sidebar, tab yang sedang dibuka,
// dropdown) semuanya bertahan - persis yang hilang tiap kali menekan F5.
//
// DIPASANG SEKALI DI HEADER SHELL, bukan per halaman. Header-nya sticky
// (bagian dari shell h-dvh, selalu terlihat walau konten di-scroll jauh),
// sehingga satu tombol di sana justru lebih mudah dijangkau daripada tombol
// per halaman yang ikut hilang saat di-scroll - sekaligus menjamin SETIAP
// halaman admin punya cara refresh, termasuk yang tidak punya tabel.
export function RefreshButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      aria-label="Muat ulang data halaman"
      title="Muat ulang data halaman"
      className={cn(
        "grid size-9 place-items-center rounded-xl border border-border/60 bg-foreground/[0.04] text-muted-foreground",
        "transition-[background-color,color,transform] duration-200 ease-out",
        "hover:bg-foreground/[0.08] hover:text-foreground active:scale-95 disabled:opacity-60",
        className,
      )}
    >
      <RefreshCw className={cn("size-4", pending && "animate-spin")} aria-hidden="true" />
    </button>
  );
}
