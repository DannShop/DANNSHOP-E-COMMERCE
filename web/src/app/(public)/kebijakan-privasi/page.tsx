import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Kebijakan Privasi" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold">Kebijakan Privasi</h1>
      <div className="flex flex-col gap-4 text-sm text-muted-foreground">
        <p>
          Halaman ini menjelaskan data apa saja yang DannShop kumpulkan dari pengguna dan untuk apa data tersebut
          digunakan.
        </p>
        <div>
          <h2 className="font-semibold text-foreground">Data yang Dikumpulkan</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Alamat email — untuk pengiriman invoice dan komunikasi terkait pesanan.</li>
            <li>Data akun game/nomor tujuan (User ID, Zone ID, nomor HP, dll.) — untuk memproses pengiriman produk.</li>
            <li>Riwayat transaksi dan saldo — untuk member yang membuat akun.</li>
            <li>Alamat IP dan metadata teknis — untuk keamanan dan mencegah penyalahgunaan sistem.</li>
          </ul>
        </div>
        <div>
          <h2 className="font-semibold text-foreground">Penggunaan Data</h2>
          <p className="mt-1">
            Data hanya digunakan untuk memproses pesanan, mengirim notifikasi terkait transaksi, dan meningkatkan
            keamanan layanan. DannShop tidak menjual atau membagikan data pribadi ke pihak ketiga untuk tujuan
            pemasaran.
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-foreground">Keamanan</h2>
          <p className="mt-1">
            Kata sandi disimpan dalam bentuk terenkripsi (hash), dan seluruh komunikasi data menggunakan koneksi
            terenkripsi (HTTPS).
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-foreground">Kontak</h2>
          <p className="mt-1">
            Pertanyaan seputar privasi data bisa disampaikan lewat halaman{" "}
            <Link href="/kontak" className="underline hover:text-foreground">
              Kontak
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
