# Menambah Produk — Otomatis & Manual

Panduan alur menambah produk di DannShop. Ada **dua jenis produk** yang cara
penambahan dan cara pengirimannya berbeda total, dan memilih jenis yang salah di
awal adalah kesalahan yang paling mahal diperbaiki belakangan.

| | Produk otomatis | Produk manual |
|---|---|---|
| Contoh | Pulsa, kuota, token PLN, diamond game | Akun aplikasi premium, jasa, barang titipan |
| Sumber data | Price list provider (Digiflazz / OkeConnect) | Diisi sendiri |
| Yang mengirim | Provider, dalam hitungan detik | Admin, dengan tangan |
| `fulfillmentMode` | `AUTO` (bawaan) | `MANUAL` |
| Wajib dipetakan ke SKU provider? | **Ya** — tanpa itu tidak bisa dijual | **Tidak** — memang tidak punya |

---

## Bagian 1 — Produk otomatis (tarik dari provider)

### Langkah 0 (sekali saja): pastikan price list-nya sudah tersedia

Impor **tidak** memanggil API provider. Dia membaca salinan lokal price list
(`ProviderPriceListCache`) yang diisi tombol **Sync Harga Sekarang** di
`/admin/providers` dan job cron tiap 3 jam.

Ini disengaja: price list Digiflazz punya rate limit ketat (`rc 83`) yang langsung
kena kalau di-hit tiap ketikan pencarian.

> **Kalau pencarian selalu kosong**, hampir pasti provider itu belum pernah
> di-sync. Layar akan bilang begitu — jalankan Sync Harga dulu.

### Langkah 1: buka menu Tambah produk

Di `/admin/products`, tombol **Tambah produk** (kanan atas) memuat semua cara
menambah dalam satu menu:

```
+ Tambah produk ▾
  ├ Produk manual              → isi sendiri (Bagian 2)
  ├──────────────────────────
  │  TARIK DARI PROVIDER
  ├ Digiflazz                  → /admin/products/import?provider=DIGIFLAZZ
  └ OkeConnect (OrderKuota)    → /admin/products/import?provider=OKECONNECT
```

Daftar providernya **dibaca dari database**: hanya provider yang kredensialnya
sudah tersimpan yang muncul. Provider yang ada di enum tapi belum punya adapter
(QiosPay, Serpul) sengaja tidak ditampilkan — memilihnya cuma akan menghasilkan
layar kosong tanpa keterangan.

Provider yang kredensialnya ada tapi belum diaktifkan tetap muncul, ditandai
**Belum aktif**. Menyusun katalog memang pekerjaan yang wajar dilakukan sebelum
provider dinyalakan; yang tidak boleh cuma melayani order.

### Langkah 2: atur empat kolom di atas

| Kolom | Isi |
|---|---|
| Provider | Sudah terisi dari menu tadi, masih bisa diganti |
| Kategori tujuan | Produk yang dibuat masuk ke kategori ini |
| Markup harga jual (%) | Harga yang dilihat pembeli = modal + markup ini |
| Markup harga modal (%) | Batas bawah harga — diskon tier member tidak akan menembusnya |

Kedua markup cuma **saran awal** yang dipakai saat item dibuat. Harga tiap item
masih bisa diubah satu per satu setelahnya, dan **Sync Harga berikutnya tidak
akan menimpanya** — sync hanya memperbarui harga *modal*, bukan harga jual.

### Langkah 3: cari brand, lalu centang yang mau diambil

Ketik nama brand, mis. `Three`, `Telkomsel`, `Mobile Legends`. Hasilnya
dikelompokkan per brand, dan **satu brand = satu produk** di katalog kita.

Dua hal yang penting dipahami di layar ini:

**Centangnya kosong secara bawaan.** Kamu memilih apa yang mau diambil, bukan
mencabut apa yang tidak mau. Untuk brand berisi ratusan denominasi, cara
sebaliknya berarti mencabut ratusan centang hanya untuk mengambil belasan. Ada
**Pilih semua** kalau memang mau seluruh brand.

**Brand yang tampil selalu lengkap denominasinya.** Kalau kata kuncimu cocok
dengan lebih banyak brand daripada yang muat di satu layar, akan muncul:

> ⚠ Menampilkan 8 dari 67 brand yang cocok. Persempit kata kuncinya untuk melihat
> sisanya — brand yang tampil selalu lengkap denominasinya.

Pemotongannya **per brand, tidak pernah per baris**. Ini bukan detail teknis:
kalau daftar dipotong di tengah brand, kamu akan membuat produk yang diam-diam
kekurangan denominasi, dan baru ketahuan saat ada pembeli mencari nominal yang
tidak ada.

### Langkah 4: tekan Tambah N item ke katalog

Yang terjadi di server, dalam satu transaksi:

1. `Product` dibuat (atau dipakai ulang kalau slug-nya sudah ada), **dalam keadaan
   nonaktif**.
2. Tiap SKU yang dicentang → satu `ProductItem` + satu mapping `ProviderSku`.
3. Harga jual & batas bawah dihitung ulang **di server** dari harga modal yang
   dibaca segar dari cache — bukan dari angka yang dikirim balik oleh browser,
   supaya harga yang akhirnya dibayar pembeli tidak bisa dipengaruhi dari sisi klien.

**Aman diulang.** SKU yang mapping-nya sudah pernah dibuat akan dilewati, tidak
di-*reprice*. Jadi impor kedua tidak akan menimpa harga yang sudah kamu sesuaikan
manual.

### Langkah 5: rapikan di halaman edit produk, lalu aktifkan

Buka produknya. Baris ringkasan di atas daftar item langsung menyebut dua hal yang
menentukan siap-tidaknya produk ini dijual:

> 30 item — 2 belum dipetakan, 1 jual rugi

Tiap item ringkas secara bawaan dan baru terbuka saat diklik. Di dalamnya ada tiga
tab:

- **Harga & status** — nama, harga jual, batas bawah, urutan, grup, tampil/tidak
- **Provider (N)** — mapping SKU, mana yang Utama vs Cadangan
- **Flash sale** — harga & jadwal flash

Satu tombol **Simpan perubahan** menyimpan tab Harga dan Flash sekaligus.

Terakhir, tekan **Aktifkan** di atas. Produk tanpa item tidak bisa diaktifkan.

### Utama vs Cadangan

Kalau satu item dipetakan ke lebih dari satu provider, yang **Utama** dicoba lebih
dulu. **Cadangan** hanya dipakai kalau yang utama gagal karena sebab yang
dipastikan **belum menyentuh produk** — IP belum terdaftar, saldo provider kurang,
produk gangguan.

Kegagalan yang statusnya tidak jelas **tidak** memicu cadangan, dan itu disengaja:
mencoba provider kedua atas transaksi yang mungkin sudah berhasil di provider
pertama berarti mengirim barang dua kali dan membayar dua kali.

---

## Bagian 2 — Produk manual (dikirim admin sendiri)

Untuk barang yang tidak ada di provider mana pun: akun aplikasi premium, jasa,
apa pun yang kamu kirim dengan tangan.

### Langkah 1: buat produknya

**Tambah produk → Produk manual**. Isi nama, slug, kategori, deskripsi — lalu yang
menentukan:

> **Mode pengiriman: Manual — dikirim admin sendiri (App Premium dsb)**

Begitu Manual dipilih, form menyembunyikan **data yang diminta ke pembeli** dan
**cek ID**. Keduanya milik alur otomatis: tidak ada provider yang akan menerima
"user ID" itu, dan tidak ada yang bisa dicek ID-nya.

### Langkah 2: tambahkan item & harga

Sama seperti produk otomatis, lewat **Tambah item**. Bedanya:

- **Tidak perlu memetakan SKU provider sama sekali.** Tanda "Belum dipetakan"
  memang wajar di sini.
- **Batas bawah harga** tetap diisi — dia yang menahan diskon tier member supaya
  tidak menembus lantai harga.

### Langkah 3: aktifkan

Produk manual tidak melewati pengecekan ketersediaan provider saat checkout.
Ketersediaannya ditentukan olehmu, bukan oleh saldo atau status SKU siapa pun.

### Yang terjadi setelah pembeli membayar

1. **Halaman produk** sudah memberi tahu pembeli sejak awal:
   > Produk ini dikirim manual oleh admin. Setelah pembayaran berhasil, kamu akan
   > diarahkan untuk konfirmasi ke admin — pengirimannya tidak otomatis.
2. **Checkout melewati provider sepenuhnya.** Tidak ada job fulfillment yang
   dijadwalkan. Order berhenti di status `PAID` dan **tidak akan bergerak sendiri.**
3. **Halaman order admin** memasang panel oranye mencolok:
   > Produk manual — menunggu kamu kirim
4. **Kamu kirim barangnya**, lalu tekan **Tandai Selesai Manual** dan isi data
   akun/SN-nya. Data itulah yang muncul di invoice dan email pembeli.
5. **Invoice pembeli** menampilkan bagian konfirmasi selama order masih `PAID` /
   `PROCESSING` / `NEEDS_REVIEW`.

> **Order manual tidak pernah selesai sendiri.** Kalau tidak ada yang menekan
> Tandai Selesai Manual, order itu menunggu selamanya. Panel oranye di langkah 3
> ada supaya order sehat yang cuma menunggu admin tidak terlihat sama dengan order
> yang macet karena rusak.

---

## Rujukan cepat

| Mau apa | Ke mana |
|---|---|
| Isi kredensial provider, cek saldo, sync harga | `/admin/providers` |
| Tarik produk dari provider | `/admin/products` → Tambah produk → nama provider |
| Bikin produk manual | `/admin/products` → Tambah produk → Produk manual |
| Ubah harga / petakan SKU / flash sale | `/admin/products/<id>` |
| Selesaikan order manual | `/admin/orders/<orderNumber>` |

| Gejala | Sebabnya biasanya |
|---|---|
| Pencarian brand selalu kosong | Provider belum pernah di-sync |
| Provider tidak ada di menu Tambah produk | Kredensialnya belum diisi di `/admin/providers` |
| Produk tidak bisa diaktifkan | Belum punya item |
| Item tampil "Belum dipetakan" | Belum dipetakan ke SKU provider — normal untuk produk manual |
| Item ditandai "Jual rugi" | Harga jual di bawah harga modal provider |
| Order manual diam di `PAID` | Memang menunggu kamu — tekan Tandai Selesai Manual |

## Dokumen terkait

- `docs/providers/okeconnect.md` — riset lengkap provider OkeConnect
- `docs/08-IP-TETAP-DIGIFLAZZ.md` — relay IP tetap (wajib untuk kedua provider)
