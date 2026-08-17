# Modal, Laba & Analytics

Dashboard dan Analytics menampilkan **omzet, laba bersih, dan margin**. Supaya angka itu benar, sistem perlu tahu modal tiap pesanan — dan dari mana modalnya datang berbeda antara produk otomatis dan manual.

---

## 1. Dari mana modal datang

| Jenis produk | Modalnya | Diisi kapan |
|---|---|---|
| **Otomatis** | Harga beli provider (`ProviderSku`) | Otomatis, saat sinkronisasi harga |
| **Manual** | Kolom **Modal** yang kamu isi di item | Manual, olehmu |

### Produk otomatis

Tidak ada yang perlu kamu lakukan. Modalnya datang sendiri dari provider dan diperbarui tiap sinkronisasi harga.

Yang dicatat ke pesanan adalah modal provider yang **benar-benar memproses** pesanan itu — bukan yang dicoba pertama. Kalau provider utama gagal dan pesanan dialihkan ke provider cadangan dengan harga berbeda, yang tercatat adalah harga yang benar-benar keluar.

Karena itu modal pesanan otomatis baru terisi **setelah pengiriman berhasil**, bukan saat checkout.

### Produk manual

Kolom **Modal** muncul di setiap item produk manual (`/admin/products` → buka produk → buka item). Produk otomatis tidak punya kolom ini sama sekali — modalnya datang dari provider, dan dua sumber untuk satu angka pasti akan menyimpang.

**Boleh dikosongkan.** Barang yang belum kamu beli memang belum punya modal pasti, dan memaksa mengisinya cuma menghasilkan tebakan yang lalu dibaca laporan sebagai fakta.

---

## 2. Kalau modal tidak diisi

Pesanan dari item tanpa modal **tidak dianggap bermodal nol**. Kalau dianggap nol, labanya terbaca 100% — angka yang terlihat hebat dan sepenuhnya bohong.

Yang terjadi: pesanan itu **dikeluarkan dari perhitungan laba**, dan jumlahnya dilaporkan terang-terangan:

> Laba dihitung dari 84 pesanan yang modalnya tercatat. **12 pesanan** (Rp 1.240.000) belum punya catatan modal.

Jadi kamu selalu tahu seberapa jauh angka laba itu bisa dipercaya.

### Pesanan lama

Pesanan yang dibuat sebelum fitur ini ada juga tidak punya catatan modal, dan akan muncul di hitungan "belum tercatat". Itu wajar — modalnya memang tidak pernah tersimpan, dan menebaknya sekarang akan mengarang data.

---

## 3. Rumus yang dipakai

```
Omzet       = jumlah `total` semua pesanan berstatus dibayar
Laba bersih = (omzet pesanan bermodal) − (modal pesanan itu)
Margin      = laba ÷ omzet pesanan bermodal
```

**`total`** = harga − diskon + biaya admin + kode unik. Yaitu uang yang benar-benar masuk.

Margin **dihitung hanya dari pesanan yang modalnya diketahui**. Membaginya dengan seluruh omzet akan menghasilkan persentase yang selalu terlihat lebih kecil dari kenyataan, sebanding dengan berapa banyak modal yang belum diisi.

### Status apa yang dihitung sebagai omzet

Dibayar, Diproses, Berhasil, Ditinjau, Menunggu Refund.

**Tidak** termasuk: belum dibayar, kedaluwarsa, gagal, sudah direfund.

### Yang belum dilacak

**Potongan MDR Midtrans tidak tercatat di sistem.** Jadi laba yang ditampilkan sedikit lebih tinggi daripada kenyataan — kira-kira sebesar 0,7% (QRIS) sampai 2% (e-wallet) dari omzet gateway.

Ini disebutkan supaya kamu tidak salah membaca angkanya sebagai laba bersih final.

---

## 4. Dashboard

Rentang waktunya bisa diganti (Hari ini / 7 / 30 / 90 hari, atau tanggal bebas), dan **tersimpan di alamat halaman** — jadi bisa di-bookmark dan dibagikan.

### Kartu Uang

| Kartu | Arti |
|---|---|
| Omzet | Seluruh uang masuk di rentang ini |
| Laba bersih | Omzet − modal, hanya dari pesanan bermodal |
| Margin | Persentase laba |
| Order | Jumlah pesanan |

### Kartu Orang

| Kartu | Arti |
|---|---|
| Pembeli aktif | User unik yang **punya pesanan dibayar** di rentang ini |
| Member berkunjung | User login unik yang **membuka situs** |
| Reseller | Yang sudah aktivasi, plus berapa yang pakai paket berbayar |
| Mitra H2H | Total dan yang aktif |

Dua yang pertama sengaja dipisah: "aktif membuka" bukan "aktif belanja", dan menggabungkannya akan menyembunyikan yang mana yang sedang turun.

### Grafik

- **Omzet & laba harian** — dua garis, satu sumbu. Keduanya rupiah, jadi tingginya memang harus bisa dibandingkan langsung
- **Order harian** — batang

Hari tanpa transaksi tetap muncul sebagai nol. Kalau hanya hari yang ada datanya digambar, grafiknya diam-diam memampatkan waktu dan penurunan drastis justru terlihat baik-baik saja.

### Panel peringatan

Muncul **hanya kalau ada yang perlu ditangani** — bukan kartu kosong permanen yang lama-lama diabaikan:

- Pesanan butuh ditinjau manual
- Pesanan menunggu refund
- Saldo provider menipis
- **Cron tidak berjalan** (peringatan merah terpisah, lihat panduan API Internal)

---

## 5. Analytics

Halaman `/admin/analytics` memakai rentang tanggal yang sama, dengan tambahan data kunjungan.

| Bagian | Isi |
|---|---|
| Panel langsung | Online sekarang, pageview/order/omzet 1 jam terakhir, pesanan terbaru |
| Penjualan | Omzet, laba, margin, rata-rata per pesanan |
| Kunjungan | Pageview, pengunjung unik, member berkunjung, reseller |
| Corong | Pengunjung → lihat produk → buat pesanan → bayar |
| Peringkat | Produk & kategori terlaris (grafik batang) |
| Rincian | Halaman terpopuler, sumber kunjungan, perangkat, metode pembayaran |

### Corong konversi adalah rasio KASAR

Angka "pengunjung" datang dari tabel kunjungan dan "pesanan" dari tabel pesanan — **keduanya tidak saling terhubung per orang**.

Pakai untuk melihat tren naik/turun, bukan sebagai pelacakan satu pembeli dari kunjungan sampai pembayaran.

### Yang tidak dilacak

Panel admin dan halaman akun **tidak dilacak sama sekali**. Trafik kerjamu sendiri tidak boleh mengotori laporan.

### Data lama

Data kunjungan mentah punya masa simpan. Untuk rentang yang lebih lama, angkanya diambil dari rangkuman harian — dan halamannya akan **memberi tahu** kalau itu terjadi. Rincian halaman & perujuk untuk periode itu tidak lagi tersedia.

---

## 6. Kalau laba terlihat aneh

| Gejala | Sebab tersering |
|---|---|
| Laba = omzet (margin 100%) | Semua pesanan di rentang itu produk manual tanpa modal |
| Laba jauh lebih kecil dari perkiraan | Ada item yang modalnya salah ketik kelebihan nol |
| Laba negatif | Modal naik di atas harga jual — periksa harga item itu |
| Banyak "belum tercatat" | Isi kolom Modal di item produk manual |
| Angka tidak cocok dengan rekening | MDR Midtrans belum diperhitungkan (lihat bagian 3) |
