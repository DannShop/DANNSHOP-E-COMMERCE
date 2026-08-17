# Invoice, Struk & Email

Halaman **Invoice & Struk** (`/admin/invoice`) mengatur empat hal berbeda yang sering tertukar:

| Bagian | Yang diatur | Dilihat siapa |
|---|---|---|
| Branding dokumen | Nama, logo, warna, alamat, kontak, kaki dokumen | Pembeli, di email & struk |
| Template email | Isi 9 email otomatis | Pembeli, di inbox |
| Pesanan manual | Tombol & pesan konfirmasi WhatsApp/Telegram | Pembeli, di halaman invoice |
| Struk | Ukuran kertas & QR | Kamu, saat mencetak |

---

## 1. Branding dokumen

Yang kamu isi di sini dipakai **email dan struk**, bukan tampilan storefront (itu di Tampilan & Tema).

| Kolom | Dipakai di |
|---|---|
| Nama brand | Judul email, kepala struk, nama aplikasi mobile (kalau belum diisi sendiri) |
| Logo dokumen | Kepala struk & email. Kosong = pakai logo situs |
| Warna aksen | Header email dan garis struk |
| Tagline | Satu baris di bawah nama brand |
| Alamat | Kaki struk, boleh multi-baris |
| Kontak dukungan | Kaki struk (WA/email/IG), boleh multi-baris |
| Teks kaki | Kalimat penutup dokumen |

**Nama brand sengaja satu sumber.** Ia dipakai ulang di manifest aplikasi mobile dan email — kalau ada dua tempat mengisinya, keduanya akan berbeda cepat atau lambat.

---

## 2. Template email

Ada **9 email** yang bisa disunting isinya:

| Template | Kapan terkirim |
|---|---|
| `order_created` | Pesanan dibuat |
| `order_completed` | Pesanan berhasil (berisi SN/voucher) |
| `order_failed` | Pesanan gagal / dana dikembalikan |
| `welcome` | Selesai mendaftar |
| `password_reset` | Minta reset password |
| `email_change_verify` | Ke alamat **baru**, berisi link konfirmasi |
| `email_change_notice` | Ke alamat **lama**, peringatan saja |
| `reseller_activation` | Selesai mendaftar reseller, berisi link aktivasi |
| `reseller_existing_account` | Form reseller publik diisi email yang sudah punya akun |

### Placeholder

Tulis `{{nama_placeholder}}` di subjek atau isi. Daftar placeholder yang tersedia **berbeda per template** dan ditampilkan di panel tepat di bawah kotak suntingnya — pakai daftar itu, bukan hafalan.

Contoh untuk `order_completed`:

```
Halo, pesanan {{order_number}} sudah berhasil.
Produk: {{product_name}} - {{item_name}}
```

### Blok

Sebagian template punya **blok** seperti `{{reset_button}}` atau `{{activation_button}}`. Blok bukan teks biasa — ia dirender jadi tombol berwarna aksenmu. Kalau blok dihapus dari template, tombolnya hilang dan penerima tidak punya cara melanjutkan.

⚠️ Khusus `email_change_notice`: template ini **sengaja tidak punya tombol konfirmasi**. Fungsinya memperingatkan pemilik alamat lama, bukan menyediakan jalan pintas — kalau alamat lama juga bisa menyetujui, penyerang yang membajak sesi tinggal menyetujuinya sendiri.

### Pratinjau & reset

Tombol **Pratinjau** merender template dengan data contoh tanpa mengirim apa pun. Tombol **Reset** mengembalikan ke teks bawaan.

---

## 3. Pesanan manual

Ini muncul di halaman invoice **hanya untuk produk yang kamu kirim sendiri** (`fulfillmentMode: MANUAL`), setelah pembayarannya masuk.

| Pengaturan | Isi |
|---|---|
| Saluran | WhatsApp / Telegram / keduanya |
| Nomor WhatsApp | Format internasional **tanpa tanda `+`**, mis. `628123456789` |
| Username Telegram | Tanpa `@` |
| Keterangan invoice | Kalimat di atas tombol konfirmasi |
| Template pesan | Pesan siap kirim yang terbuka di aplikasi chat |

### Placeholder template pesan

```
{{brand_name}}     Nama toko
{{order_number}}   Nomor pesanan
{{product_name}}   Nama produk
{{item_name}}      Nama paket/item
{{target}}         Data yang diisi pembeli saat checkout
{{total}}          Total yang sudah dibayar
{{buyer_email}}    Email pembeli
{{invoice_url}}    Link invoice
```

### Kenapa tombol "Salin pesan" selalu ada

Telegram **tidak menerima parameter teks untuk chat pribadi** — link `t.me/username` hanya membuka percakapannya, tanpa membawa pesan apa pun. Karena itu tombol salin bukan pelengkap, melainkan satu-satunya cara pembeli mengirim pesan yang benar lewat Telegram.

WhatsApp menerimanya, jadi di sana pesannya sudah terisi otomatis.

---

## 4. Struk

Halaman struk ada di `/invoice/<token>/struk`. Tiga ukuran kertas:

| Ukuran | Untuk |
|---|---|
| 58 mm | Printer termal kecil |
| 80 mm | Printer termal standar kasir |
| A4 | Printer biasa / simpan PDF |

**Ukuran bawaan** yang kamu pilih di panel menentukan yang terbuka duluan — pembeli tetap bisa mengganti.

**QR di struk** (opsional): berisi link invoice, supaya pembeli bisa mengecek status pesanannya sendiri belakangan tanpa bertanya ke kamu.

### Warna pada struk cetak

Browser membuang warna latar saat mencetak secara bawaan. Struk ini memaksanya tetap tercetak, jadi header berwarna aksenmu benar-benar keluar di kertas A4 — bukan kotak putih kosong.

### Slot "Halaman cetak struk"

Slot HTML ini (diatur di Tampilan & Tema) muncul **di atas pratinjau struk dan tidak ikut tercetak**. Cocok untuk instruksi ke kasirmu sendiri, mis. "pakai 58mm untuk printer meja depan".

---

## 5. Isi halaman invoice, dari atas ke bawah

Berguna saat kamu ingin tahu di mana sesuatu bisa disisipkan:

```
← Nama toko
[ Slot: Halaman transaksi — atas ]
┌─────────────────────────────┐
│ Nomor pesanan + status      │
│ Nama produk & item          │
│ Harga item                  │
│ Biaya admin                 │
│ Kode unik                   │
│ Total yang harus dibayar    │  ← angka final, sudah termasuk kode unik
│ [QR / tombol bayar]         │
│ [SN / voucher jika selesai] │
│ [Kirim ke WhatsApp]         │  ← disembunyikan kalau kotak konfirmasi manual muncul
└─────────────────────────────┘
[ Kotak konfirmasi pesanan manual ]   ← hanya untuk produk manual yang sudah dibayar
[ Tombol cetak struk ]                 ← hanya setelah dibayar
[ Slot: Halaman transaksi — bawah ]
```

### Kenapa "Total yang harus dibayar" hanya ada di sini

Di halaman produk, angkanya diberi label **"Total Harga"** — karena di titik itu kode unik belum dibuat. Kode unik baru muncul saat pesanan benar-benar dibuat.

Jadi hanya halaman invoice yang berhak menjanjikan angka final. Label yang mengaku sebaliknya di halaman produk akan membuat pembeli merasa ditagih diam-diam saat melihat invoice.

---

## 6. Kalau email tidak sampai

Urutan pemeriksaan, dari yang paling sering:

1. **Cek folder spam** penerima
2. **Pengaturan Situs → SMTP/Resend** — kredensialnya masih benar?
3. Kirim ulang lewat aksi terkait (mis. "Kirim ulang link aktivasi" di menu Reseller)
4. Kalau semua email berhenti bersamaan, kemungkinan besar kuota penyedia email habis atau kredensialnya dicabut — bukan masalah template
