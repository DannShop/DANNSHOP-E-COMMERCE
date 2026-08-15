# Payment Gateway (Midtrans)

Panduan operasional pembayaran DannShop: memilih mode integrasi, mengisi kunci,
dan membaca kegagalan yang paling sering muncul.

Semua pengaturannya ada di **Konfigurasi Payment** dan **Metode Pembayaran**.

---

## Dua mode integrasi

| | Snap | Core API |
|---|---|---|
| Tampilan | Popup milik Midtrans | Form pembayaran di halaman kita sendiri |
| Metode bayar | Dipilih di dalam popup | Dipilih pembeli sebelum bayar, lalu dikunci |
| Aktivasi production | Aktif begitu akun disetujui | **Harus diminta terpisah ke Midtrans** |

Mode dipindah kapan saja dari **Konfigurasi Payment** tanpa deploy ulang.

> **Snap aktif ≠ Core API aktif.** Ini jebakan yang sudah memakan waktu berhari-hari
> di proyek ini. Core API di sandbox aktif secara bawaan, jadi semuanya mulus saat
> uji coba; di production layanannya **harus diaktifkan atas permintaan**. Kalau
> pembayaran production gagal padahal sandbox lancar dan kunci sudah benar,
> curigai ini lebih dulu — bukan kodenya.

---

## Dua jebakan Midtrans yang wajib diingat

**1. Awalan server key TIDAK menandakan sandbox atau production.**
Jangan menyimpulkan lingkungan dari bentuk kuncinya. Yang menentukan adalah
lingkungan yang dipilih di dashboard Midtrans tempat kunci itu diambil.

**2. Midtrans membalas HTTP 200 untuk penolakan.**
Memeriksa status HTTP saja percuma — permintaan yang ditolak tetap datang sebagai
200. Yang menentukan adalah `status_code` di dalam body. Kode di repo ini sudah
menilai dari body; ingat ini kalau kamu menguji manual pakai curl atau Postman dan
melihat "200 OK" lalu mengira semuanya beres.

---

## Alur pengecekan saat pembayaran bermasalah

1. **Buka Konfigurasi Payment.** Pastikan mode dan server key yang terpasang
   memang milik lingkungan yang kamu maksud.
2. **Cek Metode Pembayaran.** Metode yang nonaktif tidak akan muncul di checkout
   walau Midtrans-nya sehat.
3. **Buka Log Callback.** Di sinilah terlihat apakah Midtrans mengabari kita dan
   apa isinya. Order yang dibayar tapi statusnya tidak berubah hampir selalu
   soal callback, bukan soal pembayarannya.
4. **Buka Monitoring Job.** Job `reconcile-paid-orders` adalah jaring pengaman yang
   menyusul order terbayar yang callback-nya tidak masuk. Kalau job ini menumpuk
   gagal, jaring pengamannya sedang bolong.

---

## Fee & kode unik

Fee per metode diatur di **Metode Pembayaran**. Kode unik (Rp 1–999) dibuat acak
**di server** dan sengaja tidak ikut dihitung di preview harga pada halaman
produk — angkanya baru final saat order dibuat, dan preview yang menebaknya justru
akan menampilkan total yang berbeda dari tagihan.

---

## Terkait

- **Provider & Relay IP** — sisi pengiriman barang, bukan sisi pembayaran.
- Untuk pengajuan aktivasi Core API production, teks siap kirim dan jalur
  kontaknya ada di repo: `docs/07-AKTIVASI-CORE-API-MIDTRANS.md`.
