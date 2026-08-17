# Karyawan & Peran (Hak Akses)

Halaman **`/admin/staff`** memungkinkan kamu merekrut karyawan dan memberi mereka akses **hanya ke bagian panel yang jadi tanggung jawabnya**.

Halaman ini **hanya bisa dibuka olehmu sebagai pemilik toko.** Karyawan tidak bisa membukanya, seberapa pun lengkap izin yang dia punya — dan itu bukan kelalaian: kalau "kelola karyawan" bisa didelegasikan, karyawan yang memegangnya bisa mencentang izin refund untuk dirinya sendiri dan naik setara pemilik toko, tanpa satu pun error yang menandainya.

---

## 1. Cara menambah karyawan

1. **Minta calon karyawan mendaftar sendiri** di halaman daftar toko, memakai emailnya sendiri
2. Buat peran di bawah, centang bagian yang jadi tanggung jawabnya
3. Masukkan emailnya, pilih peran, simpan
4. Dia **wajib memasang 2FA** saat pertama masuk panel

### Kenapa karyawan mendaftar sendiri

Kamu tidak pernah memegang passwordnya. Itu yang membuat catatan "dilakukan oleh karyawan X" punya arti — kalau kamu yang membuatkan akun berikut passwordnya, setiap jejak audit kehilangan maknanya karena dua orang bisa memakainya.

---

## 2. Daftar izin

Ada **9 izin**. Tiga di antaranya ditandai **sensitif** karena menyentuh uang atau akun orang lain.

| Izin | Membuka | Sensitif |
|---|---|---|
| **Kelola pesanan** | Daftar & detail pesanan, ulangi pengiriman gagal, tandai pesanan manual selesai | |
| **Refund & batalkan pesanan** | Mengembalikan uang pembeli, membatalkan pesanan | ⚠️ |
| **Lihat keuangan** | Dashboard omzet, Mutasi Saldo, Laporan Penjualan | |
| **Kelola katalog** | Produk & harga, kategori, markup, kode promo | |
| **Lihat user & tier** | Daftar user, detail user, daftar paket — tanpa bisa mengubah | |
| **Kelola akun user** | Tangguhkan/pulihkan akun, reset password, buat & ubah paket, beri paket manual | ⚠️ |
| **Kelola tampilan toko** | Banner, tampilan & tema, invoice & struk, pengaturan situs | |
| **Kelola pembayaran & provider** | Payment gateway, metode bayar, provider, cek ID, log — termasuk kredensial | ⚠️ |
| **Kelola sistem** | Pengajuan mitra, API partner, analytics, monitoring job, aplikasi mobile | |

### Pemisahan yang paling penting

**"Kelola pesanan" dan "Refund" sengaja dipisah.**

CS yang memproses pesanan sehari-hari tidak otomatis boleh mengeluarkan uang. Kalau digabung, satu-satunya cara memberi seseorang akses ke daftar pesanan adalah sekalian memberinya kunci brankas.

Halamannya sama; yang berbeda tombol mana yang berfungsi.

### Dashboard butuh "Lihat keuangan"

Halaman depan panel berisi ringkasan omzet, jadi ia diperlakukan sebagai data keuangan. Karyawan tanpa izin ini **tidak ditolak mentah-mentah** — dia diantar ke halaman pertama yang boleh dia buka.

---

## 3. Peran

Peran = kumpulan izin yang diberi nama, bisa dipakai ulang untuk beberapa karyawan.

Contoh yang masuk akal:

| Nama peran | Izin |
|---|---|
| Operator Order | Kelola pesanan |
| CS Senior | Kelola pesanan + Refund |
| Admin Katalog | Kelola katalog |
| Keuangan | Lihat keuangan |
| Operator Toko | Kelola katalog + Kelola tampilan toko |

### Menonaktifkan peran

Tombol nonaktif mencabut izin **seketika** untuk semua karyawan yang memakainya — tanpa perlu melepas penugasannya satu per satu. Berguna saat ada yang mencurigakan dan kamu ingin menutup akses cepat.

### Menghapus peran

Peran yang **masih dipakai** tidak bisa dihapus. Pindahkan karyawannya dulu, atau nonaktifkan saja perannya.

Kalau peran terhapus, karyawannya **tidak ikut terhapus** — dia kehilangan seluruh izin (jatuh ke nol) tapi akunnya tetap ada.

---

## 4. Kapan perubahan berlaku

| Perubahan | Kapan berlaku |
|---|---|
| Mengubah izin di dalam peran | **Seketika**, tanpa karyawan perlu login ulang |
| Mengangkat karyawan / memindahkan peran | Seketika — sesinya berakhir, dia login ulang |
| Mencabut akses | Seketika — sesinya berakhir |
| Menonaktifkan peran | Seketika |

Izin **tidak pernah disimpan di token sesi**, selalu dibaca segar dari database setiap permintaan. Kalau disimpan di token, izin yang sudah kamu cabut akan tetap berlaku sampai tokennya kedaluwarsa — bisa 12 jam.

---

## 5. Menu yang disembunyikan bukan pengamannya

Sidebar hanya menampilkan menu yang boleh dibuka karyawan itu. Tapi **itu kenyamanan, bukan keamanan** — menu yang disembunyikan tetap bisa diketik langsung di address bar.

Yang benar-benar menolak ada di dua lapis lain:

1. **Gerbang route** — menolak membuka halamannya
2. **Gerbang aksi** — menolak menjalankan tombolnya

Keduanya memakai daftar izin yang sama dengan penyaring menu, jadi tidak mungkin menyimpang.

---

## 6. 2FA wajib untuk karyawan

Karyawan **tidak bisa ke mana-mana di panel** sebelum memasang 2FA. Bukan cuma kamu.

Akun karyawan memegang akses ke pesanan, harga, dan data pembeli — password saja tidak cukup, dan justru akun karyawanlah yang paling mungkin passwordnya dipakai ulang di tempat lain.

Di daftar karyawan ada penanda **"Belum pasang 2FA"**. Karyawan yang tersangkut di langkah itu akan terlihat seperti "akunnya rusak", dan tanpa penanda ini kamu tidak punya cara melihat sebabnya.

Halaman **Keamanan Akun** dan **Panduan** selalu terbuka untuk siapa pun yang boleh masuk panel — kalau halaman keamanan ikut digerbang, setiap karyawan baru akan terkunci di luar panel selamanya, karena satu-satunya tempat memasang 2FA ada di sana.

---

## 7. Mencabut akses karyawan

Tombol **Cabut akses** mengembalikannya jadi user biasa — **bukan menghapus akunnya**.

Akunnya bisa saja punya riwayat pesanan sendiri, dan jejak tindakannya di log admin harus tetap menunjuk ke seseorang yang masih ada.

Sesinya berakhir seketika.
