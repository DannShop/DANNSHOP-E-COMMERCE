# Program Reseller

Program reseller menggantikan program membership berlangganan. Perbedaan intinya: **paket dibayar sekali dan berlaku selamanya**, tidak ada perpanjangan.

## Dua hal yang sering tertukar

| | Status reseller | Paket berbayar |
|---|---|---|
| Didapat dari | Mendaftar + klik link aktivasi | Membayar paket |
| Biayanya | Gratis | Sesuai harga paket |
| Efek ke harga | **Tidak ada — harga normal** | Potongan sesuai paket |

Jadi "reseller" dan "dapat diskon" bukan hal yang sama. Pendaftar baru berstatus reseller dengan **paket Gratis**, dan membayar harga normal seperti pembeli biasa. Diskon baru menyala setelah dia mengambil paket berbayar.

---

## 1. Alur pendaftaran

```
Isi formulir  →  Email aktivasi  →  Klik link  →  Aktif (paket Gratis)
                                                        ↓
                                            Pilih paket → Bayar → Diskon menyala
```

### Dua pintu masuk

| Pintu | Untuk siapa | Email & password |
|---|---|---|
| `/daftar-reseller` | Belum punya akun | Diisi sendiri |
| `/account/reseller` | Sudah punya akun | **Terkunci** — pakai milik akunnya |

Yang sudah login dan membuka `/daftar-reseller` **otomatis diantar** ke menu Reseller di dalam akunnya. Formulir publik tetap meminta email & password karena ia memang pintu bagi yang belum punya akun.

### Kalau email pendaftar ternyata sudah punya akun

Formulir publik **selalu menjawab hal yang sama**: "cek emailmu". Yang terjadi di belakang:

- Email belum terdaftar → akun dibuat + link aktivasi dikirim
- Email sudah terdaftar → dikirim email pengarah ke menu Reseller di akunnya

Jawaban di layar sengaja tidak dibedakan. Kalau dibedakan, formulir ini berubah jadi alat menguji email mana yang punya akun di tokomu — kemampuan yang sudah sengaja ditutup di formulir daftar biasa.

### Link aktivasi

Berlaku **30 menit**, sekali pakai. Bisa diminta ulang dari menu Reseller (maks 5 kali per jam), dan **link lama otomatis hangus** setiap kali yang baru dibuat.

Aktivasinya lewat **tombol**, bukan otomatis saat halaman dibuka — pemindai tautan milik penyedia email rutin mengambil setiap URL di dalam pesan, dan akan membakar token sekali-pakai sebelum manusianya sempat melihat.

---

## 2. Mengatur paket

Paket diatur di **`/admin/membership-tiers`**.

| Kolom | Arti |
|---|---|
| Nama | Tampil di kartu paket & badge |
| Harga | Dibayar sekali, berlaku selamanya |
| Diskon produk (basis point) | 100 = 1%. Berlaku di **semua** produk |
| Potongan flat produk manual | Rupiah. Berlaku **hanya** produk manual |
| Bonus deposit (basis point) | Bonus saldo tiap isi saldo |
| Benefit | Centang keuntungan tambahan |
| Warna badge | Kosmetik |

### Persen vs flat

Ini yang paling sering ditanyakan:

- **Diskon persen** berlaku di semua produk
- **Potongan flat** hanya di produk manual, dan **menggantikan** persen di produk itu — bukan ditambahkan di atasnya

Alasannya margin produk manual sering kaku dan kecil, sehingga persentase menghasilkan potongan yang tidak berarti (5% dari Rp15.000 = Rp750) atau justru terlalu dalam pada nominal besar.

Kosongkan (0) supaya produk manual ikut diskon persen seperti biasa.

### Tidak bisa jual rugi

Berapa pun potongan yang kamu setel, harga **tidak pernah menembus batas bawah harga** (`memberPrice`) yang kamu isi per item. Itu berlaku untuk diskon persen maupun flat.

Untuk produk manual, sistem juga menolak menyimpan item yang batas bawahnya di bawah modal — jadi lantainya sendiri dijamin di atas modal.

---

## 3. Naik paket

Reseller membayar **selisihnya saja**:

```
Bayar = harga paket tujuan − yang sudah dibayar untuk paket sekarang
```

Contoh: sudah bayar Gold Rp100.000, naik ke Platinum Rp150.000 → bayar **Rp50.000**.

**Kreditnya dari yang benar-benar dibayar**, bukan dari harga paket lama hari ini. Bedanya baru terasa kalau kamu menurunkan harga paket nanti: dengan aturan ini, orang yang sudah membayar penuh tidak dihukum karena promo yang tidak pernah dia nikmati.

Aturan lain:

- **Hanya naik.** Turun paket tidak tersedia, dan tidak ada pengembalian dana
- **Tidak bisa beli ulang paket yang sama** — paketnya sudah berlaku selamanya
- **Satu pembelian menunggu pada satu waktu** — mencegah dua tab menghasilkan dua tagihan untuk satu paket

Pembayaran lewat Midtrans (bukan potong saldo). Paket menyala otomatis begitu pembayarannya masuk.

---

## 4. Memberi paket manual

Di `/admin/membership-tiers` ada formulir **Beri Paket** — untuk kompensasi, hadiah, atau reseller yang membayar lewat jalur lain.

Yang terjadi:

- Paketnya diberikan tanpa pembayaran
- Akun resellernya **sekaligus diaktifkan** kalau belum
- Kreditnya dicatat **sebesar harga paket**, bukan nol — jadi kalau dia naik paket nanti, dia tetap cuma membayar selisih. Mencatatnya nol akan membuat hadiahmu justru merugikannya

Orang yang belum terdaftar sebagai reseller **tidak bisa** diberi paket — dia harus mendaftar dulu, supaya formulir data usaha dan verifikasi emailnya tidak dilewati.

---

## 5. Mengelola peserta

Di **`/admin/reseller`**:

- Ringkasan: jumlah terdaftar, yang sudah aktivasi, yang punya paket berbayar, total pendapatan paket
- Daftar peserta lengkap dengan data usaha, nomor HP, dan kode referral
- Pencarian per nama/email/usaha/HP
- Tombol **Nonaktifkan / Aktifkan**

### Arti "Nonaktifkan"

Potongan harganya **berhenti seketika**. Yang tidak terjadi: barisnya tidak dihapus, uang paketnya tidak dikembalikan, dan paketnya tidak hilang.

Mengaktifkannya lagi mengembalikan paket yang sama persis — orang yang sudah membayar tidak kehilangan apa yang dibelinya hanya karena sempat dinonaktifkan.

### Tiga status yang berbeda

| Tampilan | Artinya | Yang harus dilakukan |
|---|---|---|
| **Belum aktivasi** | Sudah isi formulir, link email belum diklik | Tunggu, atau minta dia cek spam |
| **Aktif** | Normal | — |
| **Nonaktif** | Kamu mencabutnya | Aktifkan kalau sudah beres |

Dua yang pertama sama-sama berarti "tidak dapat potongan", tapi sebabnya berbeda dan tindakan yang benar juga berbeda.

---

## 6. Kode referral

Kolom referral di formulir pendaftaran **disimpan mentah, tanpa validasi, tanpa efek apa pun** untuk sekarang.

Itu disengaja: program referralnya belum ada, tapi membuang isian ini sekarang berarti data pendaftar paling awal hilang saat programnya jadi nanti.

Kamu bisa melihat isinya di daftar peserta `/admin/reseller`.
