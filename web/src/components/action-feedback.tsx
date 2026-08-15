"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/toast";

/**
 * Umpan balik hasil server action — satu-satunya tempat yang memutuskan mana
 * yang jadi toast dan mana yang tetap menempel di halaman.
 *
 * Sebelumnya komponen ini disalin di TIGA file (admin/orders, admin/products,
 * admin/providers) dan dipakai 19 tempat. Karena sekarang isinya bukan lagi
 * sekadar dua baris JSX melainkan sebuah ATURAN, salinan yang tertinggal berarti
 * sebagian layar berperilaku beda dari sisanya tanpa ada yang sengaja
 * memutuskannya.
 *
 * ATURANNYA:
 *
 *  - **Sukses → toast kanan atas.** Kabar "tersimpan"/"dihapus" tidak perlu
 *    dibaca ulang dan tidak perlu menyita ruang di dekat tombol.
 *  - **Error → tetap inline, tidak pernah hilang sendiri.** Pesan error di
 *    aplikasi ini memuat justru keterangan yang paling mahal: nomor order yang
 *    menghalangi penghapusan, alamat IP yang harus didaftarkan, kalimat mentah
 *    dari provider. Menaruhnya di sesuatu yang lenyap setelah beberapa detik
 *    membuang informasi yang paling dibutuhkan, dan menjauhkannya dari tombol
 *    yang memicunya membuat orang harus menebak error itu milik aksi yang mana.
 */

export interface ActionResultLike {
  ok?: string;
  error?: string;
}

export function ActionMessage({ state }: { state: ActionResultLike }) {
  const toast = useToast();
  // Menahan pesan sukses yang SUDAH ditoastkan. Tanpa ini, tiap render ulang
  // karena sebab lain (mengetik di kolom sebelah, revalidate) akan memunculkan
  // toast yang sama berkali-kali.
  const lastOk = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.ok && state.ok !== lastOk.current) {
      lastOk.current = state.ok;
      toast({ message: state.ok, tone: "success" });
    }
    if (!state.ok) lastOk.current = undefined;
  }, [state.ok, toast]);

  if (!state.error) return null;
  return (
    <p aria-live="polite" className="text-xs text-destructive">
      {state.error}
    </p>
  );
}
