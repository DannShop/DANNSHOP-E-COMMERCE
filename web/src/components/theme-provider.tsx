"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    // defaultTheme "light", BUKAN "system". Yang dilihat pengunjung pertama kali
    // adalah etalase toko, dan sebagian besar HP di Indonesia berjalan dengan
    // mode gelap menyala - dengan "system", toko ini menyambut mereka dengan
    // tampilan gelap yang tidak pernah dipilih siapa pun, sementara seluruh
    // materi promosi, tangkapan layar, dan gambar produknya disiapkan terang.
    //
    // enableSystem tetap MENYALA: pilihan "Sistem" masih tersedia di penukar
    // tema, cuma tidak lagi jadi bawaan. Yang sudah pernah memilih tema tidak
    // terpengaruh sama sekali - next-themes membaca localStorage lebih dulu, dan
    // defaultTheme hanya berlaku saat belum ada pilihan tersimpan.
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem {...props}>
      {children}
    </NextThemesProvider>
  );
}
