# Aktivasi Layanan Core API Midtrans (Production)

Dokumen ini dibuat 2026-08-08 setelah seluruh pembayaran production gagal.
Isinya: bukti teknis, teks siap kirim, dan ke mana mengajukannya.

---

## 1. Ringkasan masalah (untuk konteks internal)

Semua pembayaran production gagal dengan respons berikut dari Core API:

```
POST https://api.midtrans.com/v2/charge
→ HTTP 200
  { "status_code": "402",
    "status_message": "Payment channel is not activated." }
```

Terjadi pada **kesembilan** channel: QRIS, VA BCA/BNI/BRI/CIMB/Permata,
Mandiri Bill (echannel), GoPay, ShopeePay.

**Ini bukan bug aplikasi dan bukan masalah kredensial.** Bukti pembanding,
memakai server key production yang SAMA pada menit yang sama:

| Integrasi | Endpoint | Hasil |
| --- | --- | --- |
| Snap | `POST https://app.midtrans.com/snap/v1/transactions` | **HTTP 201**, token terbit, `redirect_url` valid |
| Core API | `POST https://api.midtrans.com/v2/charge` | **402** `Payment channel is not activated.` |

Otentikasi Core API juga terbukti sah — `GET /v2/{order_id}/status` untuk
order yang tidak ada membalas `404 Transaction doesn't exist.` (bukan 401),
yang berarti server key diterima di environment production.

Penyebabnya terdokumentasi resmi di
<https://docs.midtrans.com/docs/custom-interface-core-api>:

> Core API on your account's **Sandbox Environment is activated by default**,
> so you can try & test it right away. However to activate this product for
> **Production Environment**, you will need to **request for activation**.

Artinya: **aktifnya Snap tidak mengaktifkan Core API.** Sandbox mulus karena
Core API sandbox aktif otomatis; production mati karena belum diminta.

---

## 2. Ke mana mengajukan

Ajukan lewat **jalur 1** sebagai jalur utama. Jalur 2 dan 3 untuk mengejar
kalau belum ada respons.

### Jalur 1 — Form Contact Us (utama, terlacak)

<https://midtrans.com/contact-us>

Isian yang dipilih:

| Kolom | Pilih |
| --- | --- |
| Topik | **Payment Method and Service Addition** |
| Environment | **Production** |
| Subjek | Permohonan Aktivasi Layanan Core API — Production |
| Lampiran | Screenshot respons 402 (opsional, memperkuat) |

Midtrans mencantumkan target respons **1x30 menit pada jam kerja**.

### Jalur 2 — Email

**support@midtrans.com** — pakai teks di bagian 3, subjek yang sama.
Berguna karena meninggalkan jejak tertulis yang bisa di-reply berulang.

### Jalur 3 — Telepon (kalau mendesak)

**+62 804 140 1099**

Jam operasional:
- Senin–Jumat: 08.00–21.00 WIB
- Sabtu/Minggu/libur: 09.00–13.00 WIB

Kalau sudah kirim form/email, sebutkan nomor tiketnya saat menelepon.

---

## 3. Teks siap kirim

Ganti bagian `<...>` sebelum mengirim. **Jangan pernah menuliskan server key
utuh** — 4 karakter terakhir sudah cukup bagi mereka untuk mengidentifikasi.

```
Subjek: Permohonan Aktivasi Layanan Core API - Production (Merchant ID <MERCHANT_ID>)

Halo Tim Midtrans,

Saya ingin mengajukan aktivasi layanan Core API untuk environment
PRODUCTION pada akun berikut:

  Merchant ID   : <MERCHANT_ID>
  Nama merchant : <NAMA_MERCHANT>
  Environment   : Production
  Server key    : Mid-server-...<4 KARAKTER TERAKHIR>
  Website       : <URL_SITUS>

KONDISI SAAT INI
Snap sudah aktif dan berfungsi normal di production pada akun ini.
Namun seluruh permintaan Core API ditolak.

  POST https://api.midtrans.com/v2/charge
  Respons: HTTP 200
  {
    "status_code": "402",
    "status_message": "Payment channel is not activated."
  }

Penolakan terjadi pada SEMUA channel yang kami uji:
QRIS, VA BCA, VA BNI, VA BRI, VA CIMB, VA Permata,
Mandiri Bill Payment (echannel), GoPay, dan ShopeePay.

Sebagai pembanding, dengan server key production yang sama:
  - POST https://app.midtrans.com/snap/v1/transactions -> HTTP 201 (token terbit)
  - GET  https://api.midtrans.com/v2/{order_id}/status -> 404 "Transaction
    doesn't exist." (bukan 401), sehingga kredensial Core API terbukti sah.

PERMOHONAN
Mohon diaktifkan layanan Core API untuk environment Production, beserta
channel pembayaran berikut:

  - QRIS
  - Bank Transfer VA: BCA, BNI, BRI, CIMB, Permata
  - Mandiri Bill Payment (echannel)
  - E-wallet: GoPay, ShopeePay

Aplikasi kami memakai integrasi Core API (custom interface), bukan Snap,
sehingga aktivasi ini memblokir seluruh transaksi production kami.

Mohon informasinya bila ada dokumen atau tahapan tambahan yang perlu kami
lengkapi.

Terima kasih.

<NAMA>
<JABATAN/PERUSAHAAN>
<NOMOR_HP> / <EMAIL>
```

---

## 4. Data yang perlu disiapkan

- **Merchant ID** — Dashboard Midtrans → Settings → Access Keys
- **4 karakter terakhir server key production** (jangan yang utuh)
- **URL situs production**
- Screenshot respons 402 (opsional)

---

## 5. Verifikasi setelah Midtrans bilang sudah aktif

1. Admin → Konfigurasi Payment → centang **Mode Production**
2. Klik **Test Koneksi** → harus "Kredensial sah"
3. Klik **Uji Channel Pembayaran** → semua channel harus **AKTIF**
   (tombol ini membuat transaksi uji Rp 10.000 lalu langsung membatalkannya)
4. Kembalikan **Metode Integrasi** dari Snap ke **Core API**
5. Lakukan satu transaksi nyata bernilai kecil sebagai pembuktian akhir

Selama masa tunggu, situs tetap bisa menerima pembayaran production lewat
**mode Snap** (Admin → Konfigurasi Payment → Metode Integrasi → Snap).

---

## 6. Pelajaran untuk project lain

**Kalau ada project yang mau migrasi dari Snap ke Core API, urus aktivasi
Core API production LEBIH DULU sebelum menghapus jalur Snap.** Sandbox tidak
akan pernah memberi peringatan — Core API sandbox aktif otomatis, jadi
seluruh pengembangan dan QA akan terlihat sehat sampai detik go-live.
