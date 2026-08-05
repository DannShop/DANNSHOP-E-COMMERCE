import type { Metadata } from "next";

export const metadata: Metadata = { title: "FAQ" };

const FAQS = [
  {
    q: "Berapa lama proses topup/pengiriman?",
    a: "Sebagian besar produk terkirim otomatis dalam hitungan detik sampai beberapa menit setelah pembayaran dikonfirmasi. Kalau ada gangguan dari provider, prosesnya bisa lebih lama — status pesanan bisa dipantau real-time di halaman invoice.",
  },
  {
    q: "Kenapa saldo/pesanan saya belum masuk padahal sudah bayar?",
    a: "Tunggu beberapa menit dulu — konfirmasi pembayaran kadang butuh waktu. Kalau setelah 15 menit masih belum berubah, hubungi CS lewat WhatsApp/Telegram di halaman Kontak dengan menyertakan nomor pesanan/bukti bayar.",
  },
  {
    q: "Bagaimana kalau pembayaran berhasil tapi barang gagal terkirim?",
    a: "Sistem otomatis mencoba ulang pengiriman. Kalau tetap gagal, dana akan dikembalikan sebagai saldo akun (untuk member) atau diproses refund manual oleh admin (untuk pembeli tanpa akun).",
  },
  {
    q: "Bagaimana cara mengecek status pesanan?",
    a: "Setiap pesanan punya link invoice unik yang dikirim setelah checkout — buka link itu untuk melihat status terkini. Member juga bisa melihat semua riwayat pesanan di halaman Akun Saya.",
  },
  {
    q: "Metode pembayaran apa saja yang tersedia?",
    a: "QRIS dan Virtual Account (BCA, BNI, BRI, CIMB Niaga, Permata) serta Mandiri Bill Payment. Semua metode diproses otomatis tanpa perlu konfirmasi manual ke admin.",
  },
  {
    q: "Apakah harus punya akun untuk berbelanja?",
    a: "Tidak wajib — checkout sebagai tamu (guest) tetap bisa dilakukan. Tapi dengan akun, kamu bisa isi saldo, bayar lebih cepat pakai saldo, dan melihat riwayat pesanan lengkap.",
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold">Pertanyaan Umum (FAQ)</h1>
      <div className="flex flex-col divide-y rounded-[var(--radius)] border">
        {FAQS.map((item) => (
          <details key={item.q} className="group p-4">
            <summary className="cursor-pointer list-none font-medium marker:content-none">
              <span className="flex items-center justify-between gap-3">
                {item.q}
                <span className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </span>
            </summary>
            <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
