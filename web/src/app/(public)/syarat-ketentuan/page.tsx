import type { Metadata } from "next";

export const metadata: Metadata = { title: "Syarat & Ketentuan" };

export default function TermsPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold">Syarat &amp; Ketentuan</h1>
      <div className="flex flex-col gap-4 text-sm text-muted-foreground">
        <p>
          Dengan menggunakan layanan DannShop, kamu dianggap telah membaca dan menyetujui syarat &amp; ketentuan
          berikut.
        </p>
        <div>
          <h2 className="font-semibold text-foreground">1. Data Pesanan</h2>
          <p className="mt-1">
            Pastikan data yang dimasukkan saat checkout (User ID, Zone ID, nomor tujuan, dll.) sudah benar. DannShop
            tidak bertanggung jawab atas kesalahan input data yang menyebabkan produk terkirim ke akun/nomor yang
            salah.
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-foreground">2. Pembayaran</h2>
          <p className="mt-1">
            Pembayaran wajib dilakukan sesuai nominal yang tertera (termasuk kode unik, jika ada) sebelum batas waktu
            yang ditentukan. Pesanan yang tidak dibayar sampai batas waktu akan otomatis kedaluwarsa.
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-foreground">3. Pengiriman & Kegagalan Sistem</h2>
          <p className="mt-1">
            Produk dikirim otomatis oleh sistem setelah pembayaran terkonfirmasi. Jika terjadi kegagalan pengiriman
            di luar kendali kami (gangguan provider, dsb.), dana akan dikembalikan sebagai saldo akun atau diproses
            refund sesuai kebijakan yang berlaku.
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-foreground">4. Saldo Akun</h2>
          <p className="mt-1">
            Saldo yang sudah masuk ke akun tidak dapat ditarik tunai (non-refundable ke rekening bank) dan hanya
            dapat digunakan untuk transaksi di dalam platform DannShop.
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-foreground">5. Perubahan Ketentuan</h2>
          <p className="mt-1">
            DannShop berhak mengubah syarat &amp; ketentuan ini sewaktu-waktu. Perubahan berlaku sejak dipublikasikan
            di halaman ini.
          </p>
        </div>
      </div>
    </div>
  );
}
