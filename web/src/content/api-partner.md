# DannShop — Dokumentasi API Partner (H2H)

**Versi 1.0 · Agustus 2026**

Dokumen ini ditujukan untuk **partner reseller** yang ingin memesan produk digital
DannShop (topup game, pulsa, paket data, token listrik, e-money) langsung dari
sistem mereka sendiri, tanpa membuka storefront DannShop.

> **Base URL:** `https://<domain-dannshop>`
> Domain final akan diberikan admin DannShop bersama kredensial Anda. Semua contoh
> di dokumen ini memakai `https://dannshop.example.com` sebagai pengganti.

---

## Daftar Isi

1. [Cara kerja singkat](#1-cara-kerja-singkat)
2. [Sebelum mulai](#2-sebelum-mulai)
3. [Peringatan keamanan yang wajib dibaca](#3-peringatan-keamanan-yang-wajib-dibaca)
4. [Autentikasi & signature](#4-autentikasi--signature)
5. [Endpoint](#5-endpoint)
   - [5.1 Cek Saldo](#51-cek-saldo)
   - [5.2 Price List](#52-price-list)
   - [5.3 Buat Transaksi](#53-buat-transaksi)
   - [5.4 Cek Status Transaksi](#54-cek-status-transaksi)
   - [5.5 Cek IP Anda](#55-cek-ip-anda)
6. [Format `customer_no`](#6-format-customer_no)
7. [Status transaksi & kode `rc`](#7-status-transaksi--kode-rc)
8. [Callback](#8-callback)
9. [Aturan `ref_id` & idempotensi](#9-aturan-ref_id--idempotensi)
10. [Batas request (rate limit)](#10-batas-request-rate-limit)
11. [Penanganan error yang benar](#11-penanganan-error-yang-benar)
12. [Contoh integrasi lengkap (PHP)](#12-contoh-integrasi-lengkap-php)
13. [Checklist go-live](#13-checklist-go-live)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Cara kerja singkat

DannShop memakai model **prabayar (deposit)**. Alurnya:

```
1. Anda mengisi saldo di akun DannShop Anda (QRIS / Virtual Account)
2. Sistem Anda memanggil POST /api/v1/transaction
3. Saldo Anda langsung terpotong sebesar harga produk
4. DannShop meneruskan pesanan ke provider (otomatis, 24 jam)
5. Hasil akhir dikirim ke URL callback Anda — atau Anda polling sendiri
6. Kalau transaksi GAGAL, saldo dikembalikan otomatis ke akun Anda
```

Tidak ada tagihan bulanan, tidak ada limit kredit. Yang bisa Anda belanjakan
persis sebesar saldo yang ada.

**Harga.** Harga yang Anda terima lewat `/api/v1/price-list` **sudah termasuk
diskon reseller** sesuai tier akun Anda. Jangan mengurangi diskon lagi di sisi
Anda — angka yang dikembalikan API adalah angka yang akan didebit dari saldo.

---

## 2. Sebelum mulai

Semua yang Anda butuhkan ada di **Portal Mitra** — masuk ke akun DannShop Anda,
lalu buka menu **Mitra → Buka Portal Mitra**:

| Yang Anda butuhkan | Di mana | Keterangan |
|---|---|---|
| `username` | Portal Mitra → **Kredensial** | Identitas partner Anda. **Tidak bisa diubah** |
| `apiKey` | Portal Mitra → **Kredensial** | **Rahasia.** Tidak pernah dikirim di dalam request |
| `callbackSecret` | Portal Mitra → **Kredensial** | Untuk memverifikasi callback dari kami. Opsional |
| URL callback & whitelist IP | Portal Mitra → **Kredensial** | Anda mengaturnya **sendiri**, tidak perlu menghubungi admin |
| Daftar SKU & harga Anda | Portal Mitra → **Katalog** | Sama persis dengan hasil [Price List](#52-price-list) |
| Riwayat transaksi & log callback | Portal Mitra → **Transaksi** / **Callback** | Termasuk pesan error kalau callback gagal terkirim |

Anda juga perlu:

- **Server sendiri** (PHP/Node/Python/apa pun) yang bisa mengirim HTTP POST.
  Shared hosting dengan PHP + cURL sudah cukup.
- **Saldo** yang sudah diisi. Cek lewat [Cek Saldo](#51-cek-saldo) atau lewat
  Portal Mitra → **Saldo** → Isi Saldo.
- **IP server Anda**, kalau Anda mengaktifkan whitelist IP. Jangan menebak —
  gunakan [Cek IP Anda](#55-cek-ip-anda).

> **Kalau `apiKey` Anda bocor, Anda bisa menggantinya sendiri saat itu juga**
> lewat Portal Mitra → Kredensial → *Terbitkan ulang API Key*. Key lama langsung
> mati, jadi siapkan akses ke file konfigurasi Anda sebelum menekannya.

---

## 3. Peringatan keamanan yang wajib dibaca

> ### ⛔ API ini TIDAK BOLEH dipanggil langsung dari browser
>
> Jangan memanggil endpoint di bawah dari JavaScript di halaman HTML, aplikasi
> mobile, atau apa pun yang berjalan di perangkat pengguna akhir.
>
> **Alasannya:** signature dihitung dari `apiKey` Anda. Menghitungnya di browser
> berarti `apiKey` harus ada di dalam kode yang bisa dibaca siapa saja yang menekan
> "View Source" — dan siapa pun yang memegangnya bisa **menghabiskan seluruh saldo
> Anda**. Ini berlaku juga kalau kodenya di-minify atau di-obfuscate; itu
> memperlambat, bukan mencegah.
>
> **Yang benar:** halaman web Anda memanggil server Anda sendiri, lalu **server
> Anda** yang memanggil API DannShop. `apiKey` tidak pernah meninggalkan server.
>
> ```
>   Pembeli ──► Halaman/HTML Anda ──► Server Anda ──► API DannShop
>                                     ▲
>                                     apiKey hanya ada di sini
> ```
>
> Untuk alasan yang sama, API ini **tidak mengirim header CORS**. Panggilan
> langsung dari browser akan diblokir browser itu sendiri — itu disengaja.

Selain itu:

- Simpan `apiKey` di environment variable atau file konfigurasi di luar
  `public_html`, jangan di dalam repositori kode.
- Kalau `apiKey` Anda bocor, **ganti sendiri saat itu juga** lewat Portal Mitra →
  **Kredensial** → *Terbitkan ulang API Key*. Tidak perlu menunggu admin.
  Penggantian membuat key lama langsung tidak berlaku, jadi integrasi Anda
  berhenti sampai key barunya terpasang — siapkan akses ke file konfigurasi Anda
  dulu.

---

## 4. Autentikasi & signature

Setiap request membawa tiga hal di dalam **body JSON**:

```json
{
  "username": "tokoabc",
  "sign": "<md5>",
  "...": "field lain sesuai endpoint"
}
```

`sign` dihitung dengan:

```
sign = md5( username + apiKey + salt )
```

`salt` **berbeda per endpoint** — ini disengaja, supaya satu signature yang bocor
tidak bisa dipakai untuk endpoint lain:

| Endpoint | `salt` |
|---|---|
| `/api/v1/cek-saldo` | teks literal `depo` |
| `/api/v1/price-list` | teks literal `pricelist` |
| `/api/v1/transaction` | nilai `ref_id` transaksi tersebut |
| `/api/v1/transaction/status` | nilai `ref_id` transaksi yang dicek |

Perhatikan bahwa untuk transaksi, salt-nya adalah `ref_id` — jadi **setiap
transaksi punya signature-nya sendiri** dan signature transaksi A tidak bisa
dipakai untuk transaksi B.

### Contoh perhitungan

Dengan `username = tokoabc`, `apiKey = rahasia123`, `ref_id = TRX-001`:

```
string yang di-hash : "tokoabcrahasia123TRX-001"
sign                : md5("tokoabcrahasia123TRX-001")
```

**PHP**
```php
$sign = md5($username . $apiKey . $refId);
```

**Node.js**
```js
const crypto = require("crypto");
const sign = crypto.createHash("md5").update(username + apiKey + refId).digest("hex");
```

**Python**
```python
import hashlib
sign = hashlib.md5(f"{username}{api_key}{ref_id}".encode()).hexdigest()
```

Huruf besar/kecil pada hasil hex tidak masalah — keduanya diterima.

### Header wajib

```
Content-Type: application/json
```

Tanpa header ini body Anda tidak akan terbaca dan Anda menerima `rc: "13"`.

---

## 5. Endpoint

Semua endpoint memakai method **POST** dan body **JSON**. Semua balasan berbentuk:

```json
{ "data": { "rc": "...", "message": "...", "...": "..." } }
```

> **Catatan tentang HTTP status:** berbeda dari beberapa API PPOB lain, DannShop
> mengembalikan HTTP status yang benar (400/401/402/404/409/429/500), bukan selalu
> 200. Anda tetap **harus membaca `rc`** untuk tahu sebab persisnya, tapi
> pengecekan `if (!response.ok)` di sisi Anda akan bekerja sebagaimana mestinya.

---

### 5.1 Cek Saldo

Sisa saldo prabayar Anda.

**`POST /api/v1/cek-saldo`** · salt = `depo`

**Request**
```json
{
  "username": "tokoabc",
  "sign": "e3a1c8..."
}
```

**Response — 200 OK**
```json
{
  "data": {
    "rc": "00",
    "message": "Berhasil",
    "username": "tokoabc",
    "balance": 4520000
  }
}
```

**curl**
```bash
curl -X POST https://dannshop.example.com/api/v1/cek-saldo \
  -H "Content-Type: application/json" \
  -d '{"username":"tokoabc","sign":"'"$(printf '%s' "tokoabcrahasia123depo" | md5sum | cut -d" " -f1)"'"}'
```

---

### 5.2 Price List

Katalog produk beserta **harga yang berlaku untuk Anda**.

**`POST /api/v1/price-list`** · salt = `pricelist`

**Request**
```json
{
  "username": "tokoabc",
  "sign": "b91f2d...",
  "category": "top-up-game",
  "product": "mobile-legends"
}
```

| Field | Wajib | Keterangan |
|---|---|---|
| `category` | tidak | Filter per slug kategori |
| `product` | tidak | Filter per slug produk |

**Response — 200 OK**
```json
{
  "data": {
    "rc": "00",
    "message": "Berhasil",
    "tier": "Gold",
    "total_product": 1,
    "products": [
      {
        "product": "mobile-legends",
        "product_name": "Mobile Legends",
        "category": "top-up-game",
        "category_name": "Top Up Game",
        "publisher": "Moonton",
        "customer_no_format": "User ID|Zone ID",
        "items": [
          {
            "sku": "clx8k2m1p0001abcd",
            "name": "86 Diamond",
            "price": 18500,
            "available": true
          }
        ]
      }
    ]
  }
}
```

**Penting:**

- **`sku` bersifat permanen.** Simpan di database Anda dan pakai nilai itu
  di endpoint transaksi. `sku` tidak berubah walau nama atau harga item berubah.
- **`available: false`** berarti item itu ada tapi sedang tidak bisa dibeli
  (stok provider habis, harga modal naik melebihi harga jual, atau provider
  sedang dinonaktifkan). Jangan tampilkan ke pembeli Anda.
- **`customer_no_format`** menunjukkan bentuk `customer_no` yang harus dikirim
  untuk produk tersebut — lihat [bagian 6](#6-format-customer_no).
- **Cache hasilnya.** Endpoint ini dibatasi 12 request per menit karena satu
  panggilan membaca seluruh katalog. Sinkronkan sekali per 15–60 menit, jangan
  memanggilnya setiap kali halaman produk Anda dibuka.

---

### 5.3 Buat Transaksi

Memesan produk. **Saldo Anda langsung terdebit.**

**`POST /api/v1/transaction`** · salt = nilai `ref_id`

**Request**
```json
{
  "username": "tokoabc",
  "ref_id": "TRX-20260813-0001",
  "sku": "clx8k2m1p0001abcd",
  "customer_no": "12345678|2201",
  "sign": "7f3e9a..."
}
```

| Field | Wajib | Keterangan |
|---|---|---|
| `ref_id` | ya | Nomor referensi **milik sistem Anda**. Harus unik, maks 100 karakter |
| `sku` | ya | Dari price list |
| `customer_no` | ya | Tujuan pengiriman, lihat [bagian 6](#6-format-customer_no) |

**Response — 200 OK** (transaksi diterima, sedang diproses)
```json
{
  "data": {
    "rc": "03",
    "message": "Transaksi sedang diproses",
    "ref_id": "TRX-20260813-0001",
    "order_number": "INV-20260813-4821",
    "sku": "clx8k2m1p0001abcd",
    "customer_no": "12345678|2201",
    "product_name": "Mobile Legends",
    "item_name": "86 Diamond",
    "price": 18500,
    "status": "Pending",
    "sn": null,
    "balance": 4501500,
    "replayed": false
  }
}
```

**Sebagian besar transaksi akan membalas `Pending`, bukan `Sukses`.** Itu normal:
provider memproses secara asinkron dan hasil akhirnya datang beberapa detik
kemudian lewat [callback](#8-callback) atau
[cek status](#54-cek-status-transaksi). Jangan menganggap `Pending` sebagai gagal.

`replayed: true` berarti `ref_id` ini sudah pernah diproses dan Anda sedang
menerima **transaksi yang sama, bukan yang baru** — tidak ada saldo yang terdebit
lagi. Lihat [bagian 9](#9-aturan-ref_id--idempotensi).

**Response gagal — contoh 402 Payment Required**
```json
{
  "data": {
    "rc": "20",
    "message": "Saldo tidak mencukupi untuk transaksi ini.",
    "ref_id": "TRX-20260813-0001"
  }
}
```

---

### 5.4 Cek Status Transaksi

**`POST /api/v1/transaction/status`** · salt = nilai `ref_id`

**Request**
```json
{
  "username": "tokoabc",
  "ref_id": "TRX-20260813-0001",
  "sign": "7f3e9a..."
}
```

**Response — 200 OK**
```json
{
  "data": {
    "rc": "00",
    "message": "Transaksi berhasil",
    "ref_id": "TRX-20260813-0001",
    "order_number": "INV-20260813-4821",
    "sku": "clx8k2m1p0001abcd",
    "product_name": "Mobile Legends",
    "item_name": "86 Diamond",
    "price": 18500,
    "status": "Sukses",
    "sn": "SN/1234567890",
    "created_at": "2026-08-13T09:12:44.000Z",
    "updated_at": "2026-08-13T09:12:58.000Z"
  }
}
```

**Saran interval polling** kalau Anda tidak memakai callback:

| Umur transaksi | Interval cek |
|---|---|
| 0–2 menit | tiap 10 detik |
| 2–10 menit | tiap 30 detik |
| > 10 menit | tiap 5 menit |

Kalau setelah **1 jam** status masih `Pending`, hubungi admin DannShop — jangan
membuat transaksi baru.

---

### 5.5 Cek IP Anda

```
GET /api/v1/ip
```

Satu-satunya endpoint yang **tidak butuh signature**, karena justru dipakai
sebelum integrasi Anda jalan. Jawabannya adalah alamat IP yang kami lihat dari
pemanggil request tersebut.

**Kenapa ini penting.** Whitelist IP adalah penyebab kegagalan pertama yang
paling sering. Banyak orang mendaftarkan IP yang terlihat di browser atau di
panel hosting, padahal **server keluar lewat alamat yang berbeda** (umumnya
karena NAT). Akibatnya panggilan pertama ditolak `rc: "12"` walaupun signature,
saldo, dan SKU-nya sudah benar — dan pesan errornya tidak menyinggung sama
sekali bahwa masalahnya ada di jaringan, bukan di kode.

**Jalankan dari server yang akan memanggil API**, bukan dari browser Anda:

```bash
curl https://dannshop.example.com/api/v1/ip
```

```php
<?php
echo file_get_contents('https://dannshop.example.com/api/v1/ip');
```

**Response**
```json
{
  "data": {
    "rc": "00",
    "message": "Berhasil",
    "ip": "103.28.14.5",
    "note": "Ini alamat IP yang kami lihat dari pemanggil request ini..."
  }
}
```

Daftarkan nilai `ip` itu di Portal Mitra → **Kredensial** → Whitelist IP. Kalau
server Anda punya lebih dari satu jalur keluar, jalankan beberapa kali dan
daftarkan **semua** alamat yang muncul — kalau tidak, sebagian request Anda akan
ditolak secara acak dan itu jauh lebih sulit didiagnosis daripada gagal total.

---

## 6. Format `customer_no`

`customer_no` adalah tujuan pengiriman. Kalau sebuah produk butuh **lebih dari
satu** isian (misalnya Mobile Legends butuh User ID *dan* Zone ID), pisahkan
dengan tanda **pipe** `|` sesuai urutan yang ditunjukkan `customer_no_format`
di price list.

| Produk | `customer_no_format` | Contoh `customer_no` |
|---|---|---|
| Mobile Legends | `User ID\|Zone ID` | `12345678\|2201` |
| Free Fire | `User ID` | `123456789` |
| Pulsa | `Nomor HP` | `081234567890` |
| Token Listrik | `Nomor Meter` | `14022710xxxx` |

**Jangan menyambung tanpa pemisah.** `123456782201` akan ditolak, karena kami
tidak bisa menebak di mana User ID berakhir dan Zone ID dimulai — dan menebak
salah berarti diamond masuk ke akun orang lain tanpa bisa dibatalkan.

Spasi di sekitar tiap bagian akan dibuang otomatis, jadi `12345678 | 2201` sama
saja dengan `12345678|2201`.

---

## 7. Status transaksi & kode `rc`

### Status

| `status` | Arti | Tindakan Anda |
|---|---|---|
| `Pending` | Sedang diproses | Tunggu callback / polling. **Jangan** refund pembeli |
| `Sukses` | Berhasil terkirim | Selesaikan pesanan pembeli. `sn` berisi bukti |
| `Gagal` | Gagal / dibatalkan / kedaluwarsa | Saldo Anda **sudah dikembalikan otomatis**. Refund pembeli Anda |

Hanya tiga nilai ini yang akan pernah muncul. Kalau suatu saat Anda menerima nilai
lain, perlakukan sebagai `Pending`.

### Kode `rc`

| `rc` | HTTP | Arti | Apa yang harus dilakukan |
|---|---|---|---|
| `00` | 200 | Sukses | — |
| `03` | 200 | Pending / sedang diproses | Tunggu, lalu cek status |
| `01` | 200 | Transaksi gagal | Saldo sudah dikembalikan; refund pembeli |
| `10` | 401/403 | Username tidak dikenal / akun nonaktif | Hubungi admin |
| `11` | 401 | Signature salah | Cek rumus & salt-nya. Lihat [Troubleshooting](#14-troubleshooting) |
| `12` | 403 | IP tidak diizinkan | Minta admin menambahkan IP server Anda |
| `13` | 400/413 | Format request salah | Cek nama field, `Content-Type`, ukuran body |
| `14` | 404 | SKU tidak ditemukan / nonaktif | Sinkronkan ulang price list |
| `15` | 400 | `customer_no` tidak sesuai format | Lihat [bagian 6](#6-format-customer_no) |
| `20` | 402 | Saldo tidak cukup | Isi saldo |
| `21` | 409 | `ref_id` sudah dipakai untuk transaksi lain | Pakai `ref_id` baru yang unik |
| `40` | 400/503 | Produk sedang tidak tersedia | Coba lagi nanti / pilih item lain |
| `41` | 404 | Transaksi tidak ditemukan | Cek `ref_id`-nya |
| `45` | 429 | Terlalu banyak request | Tunggu, lihat [bagian 10](#10-batas-request-rate-limit) |
| `99` | 500 | Kesalahan sistem DannShop | **Jangan kirim ulang**, cek status dulu — lihat [bagian 11](#11-penanganan-error-yang-benar) |

---

## 8. Callback

Kalau Anda memberikan URL callback ke admin, DannShop akan mengirim **HTTP POST**
ke URL itu setiap kali sebuah transaksi mencapai status akhir (`Sukses` atau
`Gagal`).

### Body yang dikirim

```json
{
  "ref_id": "TRX-20260813-0001",
  "order_number": "INV-20260813-4821",
  "sku": "clx8k2m1p0001abcd",
  "customer_no": "12345678|2201",
  "status": "Sukses",
  "rc": "00",
  "message": "Transaksi berhasil",
  "sn": "SN/1234567890",
  "price": 18500,
  "updated_at": "2026-08-13T09:12:58.000Z"
}
```

### Header

| Header | Isi |
|---|---|
| `Content-Type` | `application/json` |
| `X-DannShop-Event` | `transaction.update` |
| `X-DannShop-Signature` | HMAC-SHA256 dari **body mentah**, hex, memakai `callbackSecret` Anda |

### Memverifikasi signature callback

Verifikasi ini yang membuktikan callback benar-benar dari DannShop dan bukan dari
orang lain yang menebak URL Anda. **Lakukan sebelum mengubah apa pun di database
Anda.**

```php
<?php
$raw    = file_get_contents("php://input");
$signature = $_SERVER["HTTP_X_DANNSHOP_SIGNATURE"] ?? "";
$expected  = hash_hmac("sha256", $raw, $callbackSecret);

if (!hash_equals($expected, $signature)) {
    http_response_code(403);
    exit("signature tidak valid");
}

$data = json_decode($raw, true);
// ... proses $data
http_response_code(200);
echo "OK";
```

> Hash dihitung atas **body mentah persis seperti diterima**, bukan hasil
> `json_decode` yang di-`json_encode` ulang — urutan key bisa berubah dan
> signature tidak akan pernah cocok.

### Aturan balasan

- Balas **HTTP 2xx** kalau callback diterima. Apa pun isinya.
- Balas selain 2xx (atau timeout > 15 detik) dan kami akan **mencoba ulang**
  dengan jeda bertambah: 1, 5, 15, 60, lalu 180 menit — maksimal 5 percobaan.
- Callback bisa datang **lebih dari sekali** untuk transaksi yang sama. Buat
  handler Anda idempoten: kalau `ref_id` itu sudah Anda tandai selesai, balas
  200 dan jangan proses ulang.
- Callback **bukan pengganti** cek status. Kalau setelah beberapa menit callback
  belum masuk, lakukan polling — jangan menunggu tanpa batas.

---

## 9. Aturan `ref_id` & idempotensi

`ref_id` adalah **kunci pengaman utama Anda terhadap transaksi ganda**. Aturannya:

1. **Satu `ref_id` = satu transaksi.** Buat baru untuk setiap pesanan
   (mis. `TRX-<tanggal>-<nomor urut>` atau UUID).
2. **Kirim ulang dengan `ref_id` yang SAMA itu aman.** Kalau request Anda timeout
   dan Anda tidak tahu apakah transaksinya masuk, kirim ulang persis request yang
   sama. Kami akan mengembalikan transaksi aslinya dengan `replayed: true` —
   **tidak ada order kedua, tidak ada debit kedua**.
3. **Jangan pernah membuat `ref_id` baru untuk pesanan yang sama.** Itu satu-satunya
   cara Anda bisa terkena double-charge, dan kami tidak punya cara mendeteksinya.
4. Kalau `ref_id` yang sama dikirim dengan `sku` atau `customer_no` yang
   **berbeda**, request ditolak dengan `rc: "21"` — itu tanda ada bug di sistem
   Anda, bukan retry.

---

## 10. Batas request (rate limit)

Dihitung per **username**, per jendela 1 menit:

| Endpoint | Batas |
|---|---|
| `/api/v1/transaction` | 120 / menit |
| `/api/v1/transaction/status` | 240 / menit |
| `/api/v1/cek-saldo` | 60 / menit |
| `/api/v1/price-list` | 12 / menit |

Melebihi batas → HTTP `429` + `rc: "45"` + header `Retry-After` (detik).
Hormati header itu; jangan langsung mencoba lagi.

Butuh kuota lebih besar? Hubungi admin DannShop.

---

## 11. Penanganan error yang benar

Ini bagian yang paling sering salah diimplementasikan. Baca dua kali.

### ✅ `rc` `01` (Gagal) — aman

Transaksi benar-benar gagal, **saldo Anda sudah dikembalikan otomatis**. Refund
pembeli Anda. Tidak ada yang perlu dicek lagi.

### ⚠️ `rc` `99` (kesalahan sistem) atau timeout — JANGAN kirim ulang dengan `ref_id` baru

Pada kondisi ini, **status transaksi Anda belum pasti.** Order mungkin sudah
dibuat dan saldo sudah terdebit — kami hanya gagal membalas Anda.

Yang benar:

```
1. Tunggu 5–10 detik
2. Panggil /api/v1/transaction/status dengan ref_id YANG SAMA
   - rc 41 (tidak ditemukan) → transaksi memang tidak pernah masuk, aman dikirim ulang
   - selain itu → transaksi ADA, ikuti statusnya
3. JANGAN membuat ref_id baru
```

Membuat `ref_id` baru di titik ini adalah cara paling umum partner membeli produk
dua kali untuk satu pesanan.

### ⏳ `status: "Pending"` — bukan kegagalan

Jangan merefund pembeli, jangan mengirim ulang. Tunggu callback atau polling.

---

## 12. Contoh integrasi lengkap (PHP)

Berjalan di shared hosting mana pun yang punya cURL. Simpan di luar `public_html`
kalau memungkinkan.

```php
<?php
// ===== dannshop.php — klien API DannShop =====

class DannShop
{
    private string $baseUrl;
    private string $username;
    private string $apiKey;

    public function __construct(string $baseUrl, string $username, string $apiKey)
    {
        $this->baseUrl  = rtrim($baseUrl, '/');
        $this->username = $username;
        $this->apiKey   = $apiKey;
    }

    private function sign(string $salt): string
    {
        return md5($this->username . $this->apiKey . $salt);
    }

    private function post(string $path, array $body): array
    {
        $ch = curl_init($this->baseUrl . $path);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS     => json_encode($body),
            CURLOPT_TIMEOUT        => 30,
        ]);
        $raw    = curl_exec($ch);
        $errno  = curl_errno($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        // Timeout / koneksi gagal: status transaksi BELUM PASTI.
        // Jangan pernah menerjemahkan ini jadi "gagal" — cek status dengan
        // ref_id yang sama (lihat bagian 11 dokumentasi).
        if ($errno !== 0) {
            return ['http' => 0, 'data' => ['rc' => '99', 'message' => 'Koneksi gagal: ' . $errno]];
        }

        $json = json_decode($raw, true);
        return ['http' => $status, 'data' => $json['data'] ?? ['rc' => '99', 'message' => 'Respons tidak dikenal']];
    }

    public function cekSaldo(): array
    {
        return $this->post('/api/v1/cek-saldo', [
            'username' => $this->username,
            'sign'     => $this->sign('depo'),
        ]);
    }

    public function priceList(?string $category = null): array
    {
        $body = ['username' => $this->username, 'sign' => $this->sign('pricelist')];
        if ($category !== null) {
            $body['category'] = $category;
        }
        return $this->post('/api/v1/price-list', $body);
    }

    public function transaksi(string $refId, string $sku, string $customerNo): array
    {
        return $this->post('/api/v1/transaction', [
            'username'    => $this->username,
            'ref_id'      => $refId,
            'sku'         => $sku,
            'customer_no' => $customerNo,
            'sign'        => $this->sign($refId),   // ← salt = ref_id
        ]);
    }

    public function cekStatus(string $refId): array
    {
        return $this->post('/api/v1/transaction/status', [
            'username' => $this->username,
            'ref_id'   => $refId,
            'sign'     => $this->sign($refId),
        ]);
    }
}

// ===== Pemakaian =====

$client = new DannShop(
    'https://dannshop.example.com',
    getenv('DANNSHOP_USERNAME'),
    getenv('DANNSHOP_API_KEY')
);

$refId = 'TRX-' . date('Ymd') . '-' . $nomorPesananAnda;   // unik & disimpan di DB Anda

$res = $client->transaksi($refId, 'clx8k2m1p0001abcd', '12345678|2201');

switch ($res['data']['rc']) {
    case '00':                       // langsung sukses
        selesaikanPesanan($refId, $res['data']['sn']);
        break;

    case '03':                       // pending — ini yang paling sering
        tandaiMenunggu($refId);      // tunggu callback / polling
        break;

    case '01':                       // gagal, saldo sudah dikembalikan
        refundPembeli($refId, $res['data']['message']);
        break;

    case '20':
        alertAdmin('Saldo DannShop habis');
        break;

    case '99':
        // JANGAN kirim ulang dengan ref_id baru — cek dulu.
        $cek = $client->cekStatus($refId);
        if ($cek['data']['rc'] === '41') {
            // benar-benar tidak masuk, aman diulang dengan ref_id yang sama
            tandaiPerluDiulang($refId);
        } else {
            tandaiMenunggu($refId);
        }
        break;

    default:
        alertAdmin('DannShop rc ' . $res['data']['rc'] . ': ' . $res['data']['message']);
}
```

---

## 13. Checklist go-live

- [ ] `apiKey` disimpan di environment variable / file di luar `public_html`
- [ ] Semua panggilan API dilakukan dari **server**, bukan dari browser
- [ ] `ref_id` unik per pesanan dan **disimpan di database Anda**
- [ ] Price list di-cache, tidak dipanggil per tampilan halaman
- [ ] `status: "Pending"` ditangani sebagai "tunggu", bukan "gagal"
- [ ] `rc: "99"` / timeout memicu **cek status**, bukan kirim ulang
- [ ] Handler callback memverifikasi `X-DannShop-Signature`
- [ ] Handler callback idempoten (callback ganda tidak diproses dua kali)
- [ ] Handler callback membalas HTTP 200
- [ ] Polling cadangan tetap jalan walau callback dipakai
- [ ] IP server sudah didaftarkan ke admin (kalau whitelist diaktifkan)
- [ ] Saldo terisi dan `POST /api/v1/cek-saldo` sudah berhasil dites

---

## 14. Troubleshooting

### `rc: "11"` — Signature tidak cocok

Urutan pemeriksaan, dari yang paling sering:

1. **Salt-nya salah.** Untuk `/transaction` dan `/transaction/status`, salt adalah
   **`ref_id`**, bukan teks `"transaction"`. Untuk `/cek-saldo` salt-nya `depo`,
   untuk `/price-list` salt-nya `pricelist`.
2. **Ada spasi ikut ter-hash.** Pastikan `apiKey` yang Anda simpan tidak punya
   spasi/baris baru di ujungnya — ini penyebab paling sering saat key disalin dari
   chat. Coba `trim()`.
3. **Urutan penggabungan salah.** Rumusnya `username + apiKey + salt`, bukan
   urutan lain.
4. **`ref_id` yang di-hash beda dengan yang dikirim.** Kalau Anda menormalkan
   `ref_id` (trim, uppercase) setelah menghitung signature, keduanya tidak akan
   cocok.

### `rc: "12"` — IP tidak diizinkan

Pesan errornya menyebutkan IP yang kami lihat. Cara paling pasti: jalankan
[Cek IP Anda](#55-cek-ip-anda) **dari server tersebut**, lalu daftarkan hasilnya
sendiri di Portal Mitra → **Kredensial** → Whitelist IP.

Kalau server Anda punya IP yang berganti-ganti (cloud/VPS dengan NAT dinamis),
**kosongkan saja whitelist-nya** — whitelist yang tidak pernah cocok lebih
berbahaya daripada tidak ada whitelist sama sekali, karena kegagalannya muncul
acak dan terlihat seperti masalah lain.

### `rc: "14"` — SKU tidak ditemukan

`sku` yang Anda simpan sudah dinonaktifkan atau produknya dihapus. Sinkronkan
ulang price list. Kalau ini sering terjadi, perpendek interval sinkronisasi Anda.

### `rc: "40"` — Produk sedang tidak tersedia

Ada dua sebab yang berbeda dan bedanya penting:

- **Sementara** — stok provider habis, harga modal sedang di atas harga jual, atau
  provider sedang dinonaktifkan. Field `available` di price list menunjukkan hal
  yang sama. Coba lagi nanti.
- **Permanen** — produk itu memang tidak dibuka untuk mitra (pesannya menyebut
  "tidak tersedia untuk mitra" atau "dikirim manual"). Menunggu tidak akan
  mengubah apa pun; **tarik ulang price list** dan hapus SKU itu dari katalog
  Anda. Ini alasan kenapa price list harus disegarkan berkala, bukan disimpan
  sekali lalu dipakai selamanya.

### Callback tidak pernah masuk

Cek dulu Portal Mitra → **Callback**: di situ terlihat setiap percobaan kirim
beserta pesan error terakhir dari server Anda, dan ada tombol kirim ulang.
Kalau daftarnya kosong padahal transaksinya sudah selesai, berarti masalahnya di
konfigurasi, bukan di pengiriman:

1. Pastikan URL callback sudah terisi di Portal Mitra → **Kredensial** dan berupa **https**.
2. Pastikan URL-nya bisa diakses dari internet (bukan `localhost`, tidak di balik
   basic-auth, tidak diblokir firewall/Cloudflare).
3. Pastikan handler Anda membalas **HTTP 200** — balasan 3xx/4xx/5xx dihitung
   gagal dan akan di-retry lalu berhenti setelah 5 percobaan.
4. Sementara itu, **polling tetap bekerja** dan bisa dipakai sebagai cadangan.

### Transaksi `Pending` lebih dari 1 jam

Hubungi admin DannShop dengan menyertakan `ref_id` dan `order_number`. Jangan
membuat transaksi baru — saldo Anda masih tertahan di transaksi yang lama dan
akan dikembalikan otomatis kalau akhirnya gagal.

---

## Kontak

Pertanyaan teknis, permintaan kuota, pendaftaran IP, atau penggantian kredensial:
hubungi admin DannShop lewat kanal yang sudah disepakati.

---

*Dokumen ini menjelaskan API versi 1. Perubahan yang merusak kompatibilitas akan
diterbitkan sebagai versi baru (`/api/v2/...`) — endpoint `/api/v1/` tidak akan
berubah bentuknya.*
