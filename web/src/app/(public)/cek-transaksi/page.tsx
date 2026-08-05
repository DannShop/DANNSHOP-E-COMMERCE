import type { Metadata } from "next";
import { CekTransaksiForm } from "./cek-transaksi-form";

export const metadata: Metadata = { title: "Cek Transaksi" };

export default function CekTransaksiPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-bold">Cek Transaksi</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Masukkan email dan nomor pesanan untuk melihat status transaksi Anda.
        </p>
      </div>
      <CekTransaksiForm />
    </div>
  );
}
