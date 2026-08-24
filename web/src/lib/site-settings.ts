import { cache } from "react";
import { db } from "@/lib/db";

export interface FaqItem {
  q: string;
  a: string;
}

export interface SiteSettings {
  logoUrl: string | null;
  logoType: "image" | "video";
  trendingMode: "manual" | "auto";
  faviconUrl: string | null;
  faqItems: FaqItem[];
  tosContent: string;
  privacyContent: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  whatsappCs: string;
  telegramCs: string;
  csHours: string;
}

// Default sebelum admin pernah menyimpan apa pun - konten asli yang dulu
// hardcode di masing-masing halaman, dipindah ke sini supaya halaman tidak
// pernah tampil kosong di deploy pertama sebelum admin sempat mengedit.
const DEFAULT_FAQ_ITEMS: FaqItem[] = [
  {
    q: "Berapa lama proses topup/pengiriman?",
    a: "Sebagian besar produk terkirim otomatis dalam hitungan detik sampai beberapa menit setelah pembayaran dikonfirmasi. Kalau ada gangguan dari provider, prosesnya bisa lebih lama — status pesanan bisa dipantau real-time di halaman invoice.",
  },
  {
    q: "Kenapa saldo/pesanan saya belum masuk padahal sudah bayar?",
    a: "Tunggu beberapa menit dulu — konfirmasi pembayaran kadang butuh waktu. Kalau kamu tidak simpan link invoice-nya, cari lagi lewat halaman Cek Transaksi (masukkan email + nomor pesanan). Kalau setelah 15 menit masih belum berubah, hubungi CS lewat WhatsApp/Telegram di halaman Kontak dengan menyertakan nomor pesanan/bukti bayar.",
  },
  {
    q: "Bagaimana kalau pembayaran berhasil tapi barang gagal terkirim?",
    a: "Sistem otomatis mencoba ulang pengiriman. Kalau tetap gagal, dana akan dikembalikan sebagai saldo akun (untuk member) atau diproses refund manual oleh admin (untuk pembeli tanpa akun).",
  },
  {
    q: "Bagaimana cara mengecek status pesanan?",
    a: "Setiap pesanan punya link invoice unik yang dikirim setelah checkout — buka link itu untuk melihat status terkini. Kalau link-nya hilang, buka halaman Cek Transaksi dan masukkan email + nomor pesanan yang dipakai saat checkout. Member juga bisa melihat semua riwayat pesanan di halaman Akun Saya tanpa perlu link invoice.",
  },
  {
    q: "Metode pembayaran apa saja yang tersedia?",
    a: "QRIS dan Virtual Account (BCA, BNI, BRI, CIMB Niaga, Permata) serta Mandiri Bill Payment. Semua metode diproses otomatis tanpa perlu konfirmasi manual ke admin.",
  },
  {
    q: "Apakah harus punya akun untuk berbelanja?",
    a: "Tidak wajib — checkout sebagai tamu (guest) tetap bisa dilakukan. Tapi dengan akun, kamu bisa isi saldo, bayar lebih cepat pakai saldo, upgrade ke tier member untuk diskon & benefit tambahan, dan melihat riwayat pesanan lengkap.",
  },
  {
    q: "Bagaimana cara mengisi saldo akun?",
    a: "Login, buka halaman Isi Saldo di Akun Saya, masukkan nominal, lalu bayar lewat metode yang sama seperti checkout biasa (QRIS/VA/Mandiri). Saldo otomatis bertambah begitu pembayaran dikonfirmasi sistem — tidak perlu konfirmasi manual ke admin.",
  },
  {
    q: "Apa itu tier member, gimana cara dapat diskon?",
    a: "Tier member (mis. Bronze/Silver/Gold/Platinum) adalah paket berlangganan yang bisa dibeli lewat halaman Membership — tiap tier punya diskon harga produk dan benefit lain (bebas biaya admin, tanpa kode unik, bonus saldo isi ulang, dsb.) sesuai yang diatur. Login saja tidak otomatis memberi diskon — harus punya tier aktif.",
  },
  {
    q: "Apa itu Flash Sale?",
    a: "Sebagian produk sesekali punya harga diskon untuk periode waktu terbatas, ditandai label \"Flash Sale\" di halaman produk. Begitu waktunya habis, harga otomatis balik ke harga normal — tidak berlaku surut ke pesanan yang sudah dibuat sebelumnya.",
  },
];

const DEFAULT_TOS_CONTENT = `Syarat & Ketentuan ini mengatur penggunaan layanan DannShop ("kami", "platform"). Dengan mengakses atau bertransaksi di DannShop, kamu ("pengguna") dianggap telah membaca, memahami, dan menyetujui seluruh isi halaman ini. Halaman ini disusun mengikuti prinsip umum Undang-Undang Perlindungan Konsumen (UU No. 8 Tahun 1999) dan Undang-Undang Informasi dan Transaksi Elektronik (UU No. 11 Tahun 2008 jo. UU No. 19 Tahun 2016) — bukan dokumen hukum yang sudah ditinjau firma hukum, jadi kalau ada kebutuhan kepatuhan yang lebih ketat, konsultasikan lebih lanjut dengan penasihat hukum sebelum digunakan secara komersial penuh.

## 1. Ruang Lingkup Layanan
DannShop menyediakan layanan topup produk digital (item game, pulsa, e-money, token listrik, dan kategori sejenis) yang diproses melalui sistem otomatis maupun mitra penyedia (provider) pihak ketiga. Ketersediaan produk dan harga dapat berubah sewaktu-waktu tanpa pemberitahuan sebelumnya.

## 2. Akun Pengguna
Pembuatan akun bersifat opsional — transaksi tanpa akun (checkout sebagai tamu) tetap dapat dilakukan. Pengguna yang membuat akun bertanggung jawab menjaga kerahasiaan kata sandi dan seluruh aktivitas yang terjadi melalui akunnya. DannShop berhak menonaktifkan akun yang terindikasi disalahgunakan (percobaan penipuan, manipulasi sistem, penyalahgunaan kode promo/flash sale, dsb.).

## 3. Data Pesanan
Pastikan data yang dimasukkan saat checkout (User ID, Zone ID, nomor tujuan, dan sejenisnya) sudah benar sebelum menyelesaikan pembayaran. DannShop tidak bertanggung jawab atas kesalahan input data yang menyebabkan produk terkirim ke akun/nomor yang salah, karena proses pengiriman berjalan otomatis berdasarkan data yang dimasukkan pengguna sendiri.

## 4. Harga, Pembayaran & Kode Unik
Harga yang berlaku adalah harga yang tampil di halaman produk pada saat pesanan dibuat — termasuk diskon tier member (untuk pengguna dengan langganan tier aktif) atau harga flash sale (untuk periode waktu terbatas) bila berlaku. Pembayaran non-saldo dapat disertai kode unik (Rp1–999) untuk mempermudah pencocokan otomatis dan wajib dibayar sesuai nominal total yang tertera sebelum batas waktu yang ditentukan. Pesanan yang tidak dibayar sampai batas waktu akan otomatis kedaluwarsa dan perlu dibuat ulang.

## 5. Pengiriman Produk & Kegagalan Sistem
Produk dikirim otomatis oleh sistem setelah pembayaran terkonfirmasi. Jika terjadi kegagalan pengiriman di luar kendali kami (gangguan sistem provider, perubahan harga modal mendadak, dsb.), sistem akan mencoba ulang secara otomatis; jika tetap gagal, dana dikembalikan sesuai ketentuan Kebijakan Refund pada Pasal 6.

## 6. Kebijakan Refund
Untuk pengguna yang login (member), dana dari pesanan gagal dikembalikan otomatis sebagai saldo akun. Untuk pembeli tanpa akun (tamu), permintaan refund diproses secara manual oleh tim kami — status dapat dipantau di halaman invoice pesanan terkait. Dana yang sudah masuk sebagai saldo akun tidak dapat dicairkan kembali ke rekening bank (lihat Pasal 7).

## 7. Saldo Akun (Wallet)
Saldo yang sudah masuk ke akun bersifat non-refundable ke rekening bank/e-wallet eksternal dan hanya dapat digunakan untuk transaksi di dalam platform DannShop. Riwayat mutasi saldo dapat dilihat oleh pengguna di halaman akunnya.

## 8. Flash Sale & Harga Promosi
Harga flash sale hanya berlaku selama jadwal yang ditentukan dan otomatis kembali ke harga normal setelah berakhir — tidak berlaku surut untuk pesanan yang sudah dibuat sebelum atau sesudah periode tersebut. DannShop berhak membatasi jumlah pembelian per pengguna untuk item flash sale bila diperlukan.

## 9. Larangan Penggunaan
Pengguna dilarang menggunakan layanan untuk aktivitas melawan hukum, memanipulasi sistem harga/promosi, melakukan chargeback yang tidak berdasar, atau mencoba mengakses data pengguna lain tanpa hak. Pelanggaran dapat berakibat pembatalan pesanan, penangguhan akun, dan/atau pelaporan ke pihak berwenang bila diperlukan.

## 10. Batasan Tanggung Jawab
Selama diizinkan oleh hukum yang berlaku, DannShop tidak bertanggung jawab atas kerugian tidak langsung akibat gangguan layanan pihak ketiga (penyedia produk, penyedia pembayaran, penyedia infrastruktur) yang berada di luar kendali wajar kami.

## 11. Force Majeure
DannShop dibebaskan dari tanggung jawab atas keterlambatan atau kegagalan layanan yang disebabkan keadaan di luar kendali wajar, termasuk namun tidak terbatas pada bencana alam, gangguan infrastruktur internet/listrik berskala luas, kebijakan pemerintah, atau gangguan sistemik pada pihak ketiga (bank, penyedia pembayaran, penyedia produk).

## 12. Penyelesaian Sengketa & Hukum yang Berlaku
Ketentuan ini diatur dan ditafsirkan berdasarkan hukum Republik Indonesia. Sengketa yang timbul diupayakan diselesaikan secara musyawarah terlebih dahulu melalui kanal Kontak sebelum menempuh jalur hukum lebih lanjut.

## 13. Perubahan Ketentuan
DannShop berhak mengubah Syarat & Ketentuan ini sewaktu-waktu. Perubahan berlaku efektif sejak dipublikasikan di halaman ini — penggunaan layanan setelah perubahan dianggap sebagai persetujuan atas ketentuan yang telah diperbarui.`;

const DEFAULT_PRIVACY_CONTENT = `Kebijakan Privasi ini menjelaskan bagaimana DannShop mengumpulkan, menggunakan, menyimpan, dan melindungi data pribadi pengguna, disusun mengikuti prinsip umum Undang-Undang No. 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP). Halaman ini bukan hasil tinjauan firma hukum — untuk kepatuhan penuh terhadap UU PDP (termasuk kewajiban seperti penunjukan petugas pelindungan data pada skala tertentu), konsultasikan dengan penasihat hukum sebelum digunakan secara komersial penuh.

## Data Pribadi yang Dikumpulkan
- Alamat email — untuk pengiriman invoice, notifikasi transaksi, dan verifikasi akun.
- Nomor WhatsApp (opsional) — untuk dihubungi tim CS terkait kendala pesanan.
- Data akun game/nomor tujuan (User ID, Zone ID, nomor HP, dan sejenisnya) — untuk memproses pengiriman produk ke tujuan yang benar.
- Riwayat transaksi dan saldo akun — untuk pengguna yang membuat akun (member).
- Kata sandi — disimpan dalam bentuk hash terenkripsi, tidak pernah dalam bentuk teks biasa.
- Alamat IP dan metadata teknis (jenis perangkat, waktu akses) — untuk keamanan sistem dan mencegah penyalahgunaan.

## Dasar & Tujuan Pemrosesan
Data diproses berdasarkan pelaksanaan transaksi yang diminta pengguna (pemrosesan pesanan, pengiriman produk, penanganan refund) dan kepentingan sah DannShop dalam menjaga keamanan sistem (mencegah penipuan, penyalahgunaan promo, serangan otomatis). Kami tidak menggunakan data pribadi untuk profiling otomatis yang berdampak hukum terhadap pengguna.

## Pihak Ketiga yang Menerima Data
Data dibagikan secara terbatas ke pihak ketiga hanya sejauh diperlukan untuk menjalankan layanan:
- Penyedia pembayaran (payment gateway) — menerima data transaksi untuk memproses pembayaran.
- Penyedia produk digital (provider topup) — menerima data tujuan pesanan (User ID/Zone ID/nomor HP) untuk mengirimkan produk.
- Penyedia infrastruktur hosting dan basis data — menyimpan data secara terenkripsi dalam menjalankan layanan.

DannShop tidak menjual data pribadi pengguna ke pihak ketiga untuk tujuan pemasaran.

## Penyimpanan & Retensi Data
Data disimpan selama akun pengguna aktif dan selama diperlukan untuk memenuhi kewajiban hukum (termasuk pencatatan transaksi untuk keperluan audit/pajak). Pengguna dapat meminta penghapusan data sesuai Pasal Hak Pengguna di bawah, dengan pengecualian data yang wajib disimpan untuk kepatuhan hukum.

## Keamanan
Kata sandi disimpan dalam bentuk terenkripsi (hash) dan tidak pernah dapat dibaca kembali dalam bentuk asli oleh siapa pun termasuk oleh tim internal. Seluruh komunikasi data menggunakan koneksi terenkripsi (HTTPS), dan kredensial pihak ketiga (kunci API, dsb.) disimpan terenkripsi di sisi server.

## Hak Pengguna
Sesuai prinsip UU PDP, pengguna berhak untuk: mengakses data pribadinya, meminta koreksi data yang tidak akurat, meminta penghapusan data (dengan pengecualian data yang wajib disimpan untuk kepatuhan hukum), serta mengajukan keberatan atas pemrosesan tertentu. Permintaan dapat diajukan melalui halaman Kontak.

## Cookie & Sesi
DannShop menggunakan cookie sesi untuk menjaga status login pengguna. Cookie ini bersifat fungsional (bukan untuk pelacakan iklan pihak ketiga) dan akan kedaluwarsa sesuai durasi sesi yang ditentukan sistem.

## Perubahan Kebijakan
DannShop berhak memperbarui Kebijakan Privasi ini sewaktu-waktu. Perubahan berlaku efektif sejak dipublikasikan di halaman ini.

## Kontak
Pertanyaan atau permintaan terkait data pribadi bisa disampaikan lewat halaman Kontak.`;

const DEFAULT_MAINTENANCE_MESSAGE = "Optimalisasi sistem sedang dalam proses.";
const DEFAULT_CS_HOURS = "Setiap hari, 08.00 – 22.00 WIB";

const SETTINGS_KEYS = [
  "logo_url",
  "logo_type",
  "trending_mode",
  "favicon_url",
  "faq_items",
  "tos_content",
  "privacy_content",
  "maintenance_mode",
  "maintenance_message",
  "whatsapp_cs",
  "telegram_cs",
  "cs_hours",
] as const;

// cache() dari React: beberapa titik di satu request yang sama (root layout
// untuk favicon, halaman beranda untuk logo/trending, dsb) sekarang manggil
// fungsi ini - dibungkus supaya cuma 1 query DB per request, bukan dobel.
export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  const rows = await db.siteSetting.findMany({ where: { key: { in: [...SETTINGS_KEYS] } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  let faqItems = DEFAULT_FAQ_ITEMS;
  const rawFaqItems = map.get("faq_items");
  if (rawFaqItems) {
    try {
      const parsed = JSON.parse(rawFaqItems);
      if (Array.isArray(parsed)) faqItems = parsed;
    } catch {
      // JSON korup - jangan sampai halaman FAQ 500, fallback ke default
    }
  }

  return {
    logoUrl: map.get("logo_url") ?? null,
    logoType: map.get("logo_type") === "video" ? "video" : "image",
    trendingMode: map.get("trending_mode") === "auto" ? "auto" : "manual",
    faviconUrl: map.get("favicon_url") ?? null,
    faqItems,
    tosContent: map.get("tos_content") ?? DEFAULT_TOS_CONTENT,
    privacyContent: map.get("privacy_content") ?? DEFAULT_PRIVACY_CONTENT,
    maintenanceMode: map.get("maintenance_mode") === "on",
    maintenanceMessage: map.get("maintenance_message") || DEFAULT_MAINTENANCE_MESSAGE,
    // Fallback ke env var lama (NEXT_PUBLIC_*) kalau admin belum pernah
    // menyimpan lewat form baru - channel CS tidak boleh mendadak kosong
    // di deploy pertama sebelum admin sempat buka halaman pengaturan.
    whatsappCs: map.get("whatsapp_cs") ?? process.env.NEXT_PUBLIC_WHATSAPP_CS ?? "",
    telegramCs: map.get("telegram_cs") ?? process.env.NEXT_PUBLIC_TELEGRAM_CS ?? "",
    csHours: map.get("cs_hours") || DEFAULT_CS_HOURS,
  };
});

// Dipakai proxy.ts (cek tiap request publik) - query sendiri yang cuma
// ambil 1 baris, bukan lewat getSiteSettings() yang narik semua key
// sekaligus dan biayanya sama tapi datanya tidak dipakai di sana.
export async function isMaintenanceModeOn(): Promise<boolean> {
  const row = await db.siteSetting.findUnique({ where: { key: "maintenance_mode" } });
  return row?.value === "on";
}
