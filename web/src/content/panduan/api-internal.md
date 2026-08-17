# API Internal — Webhook, Cron & Endpoint Publik

Dokumen ini menjelaskan **semua endpoint HTTP selain API Partner**. Untuk API yang dipakai mitra H2H, buka panduan **API Partner (H2H)** — spesifikasinya terpisah dan jauh lebih panjang.

## Peta seluruh endpoint

| Endpoint | Metode | Siapa yang memanggil | Auth |
|---|---|---|---|
| `/api/v1/*` | POST/GET | Mitra H2H | Signature md5 — lihat panduan API Partner |
| `/api/webhooks/midtrans` | POST | Midtrans | Signature SHA-512 |
| `/api/webhooks/digiflazz` | POST | Digiflazz | Signature |
| `/api/webhooks/okeconnect/[secret]` | POST | OkeConnect | Rahasia di URL |
| `/api/cron/tick` | POST | Cron eksternal (cPanel) | `CRON_SECRET` |
| `/api/orders/[token]/status` | GET | Halaman invoice (browser pembeli) | Token invoice |
| `/api/deposits/[depositId]/status` | GET | Halaman deposit (browser pembeli) | Sesi login |
| `/api/search` | GET | Kotak cari storefront | Publik |
| `/api/track` | POST | Pelacak analytics | Publik, dibatasi laju |
| `/api/admin/*` | GET | Panel admin | Sesi admin + izin |
| `/api/auth/[...nextauth]` | — | NextAuth | Internal |

---

## 1. Webhook Midtrans

```
POST /api/webhooks/midtrans
```

Dipanggil Midtrans setiap kali status pembayaran berubah.

**Yang wajib dipahami:** payload webhook hanya diperlakukan sebagai **pemicu**, bukan sebagai kebenaran. Setelah menerimanya, sistem **memanggil balik Midtrans** untuk menanyakan status sebenarnya (`GET status`), lalu memutuskan dari jawaban itu.

Karena itu jalur rekonsiliasi (yang tidak punya payload sama sekali) bisa memakai fungsi yang sama persis.

**Pencocokan** memakai `order_id`, bukan nominal. Satu `order_id` bisa menunjuk tiga hal berbeda, dicoba berurutan:

1. `Order.orderNumber` — pesanan produk
2. `Deposit.id` — isi saldo
3. `TierPurchase.id` — pembelian paket reseller

**Anti-dobel-proses:** setiap penerapan memakai klaim atomik (`updateMany ... where status: "PENDING"`). Webhook Midtrans mengirim ulang notifikasi yang sama berkali-kali; tanpa klaim ini saldo bisa dikredit dua kali.

**Penjaga nominal:** kalau jumlah yang dibayar tidak sama persis dengan yang ditagihkan, saldo/paket **tidak diberikan** dan kamu dapat notifikasi Telegram anomali. Sistem berhenti dan memanggil manusia, bukan menebak.

### Cara memasang URL-nya

Dashboard Midtrans → Settings → Configuration → **Payment Notification URL**:

```
https://<domain-kamu>/api/webhooks/midtrans
```

---

## 2. Webhook Provider (Digiflazz & OkeConnect)

```
POST /api/webhooks/digiflazz
POST /api/webhooks/okeconnect/<secret>
```

Dipanggil provider saat status pengiriman produk berubah.

**Perbedaan penting keduanya:**

| | Digiflazz | OkeConnect |
|---|---|---|
| Signature | Ada | **Tidak ada sama sekali** |
| Cara mengamankan | Verifikasi signature | Rahasia panjang di dalam URL |
| Cara memutuskan | Baca payload | Payload cuma pemicu → panggil `checkStatus` |

OkeConnect tidak menyediakan signature apa pun, jadi URL-nya sendiri yang jadi rahasia. **Jangan pernah menempelkan URL callback OkeConnect di chat, isu, atau tangkapan layar** — siapa pun yang memilikinya bisa memicu endpoint itu.

Kode callback-nya bisa dibuat ulang kapan saja di `/admin/providers`. Kalau pernah bocor, buat ulang lalu pasang yang baru di dashboard provider.

---

## 3. Cron

```
POST /api/cron/tick
Header: Authorization: Bearer <CRON_SECRET>
```

**Cron proyek ini eksternal** (cPanel Rumahweb), bukan cron Vercel. Harus dipanggil **setiap menit**.

Yang dikerjakan tiap ketukan:

- Kedaluwarsakan pesanan & deposit yang tidak dibayar
- Kedaluwarsakan pembelian paket reseller yang menggantung
- Periksa ulang pesanan yang masih diproses provider
- Kirim ulang callback ke mitra yang gagal
- Sinkronkan harga provider
- Periksa saldo provider & kirim peringatan
- Bersihkan baris rate limit lama

### Kalau cron mati

Dashboard admin akan menampilkan **peringatan merah besar** — dan itu sengaja dipicu oleh kamu yang membuka panel, jadi tidak bergantung pada cron yang justru sedang mati.

Selama cron mati: pesanan tidak auto-expire, harga tidak tersinkron, callback mitra tidak terkirim, dan pesanan yang sudah sukses di provider bisa nyangkut "Diproses" selamanya.

**Urutan memeriksa:**

1. URL di cron eksternal masih menunjuk domain yang hidup? Domain Vercel lama akan menjawab 404 tiap menit tanpa gejala apa pun
2. Panggil endpoint-nya manual — balasan 401 menyertakan `reason` yang menyebutkan apakah `CRON_SECRET` belum terpasang atau secretnya tidak cocok

---

## 4. Endpoint status (dipakai browser pembeli)

```
GET /api/orders/<publicToken>/status
```

Di-polling halaman invoice tiap beberapa detik supaya status berubah sendiri tanpa refresh.

**`publicToken` adalah kredensialnya.** Bukan nomor pesanan — token acak kriptografis. Siapa pun yang memegang link invoice bisa melihat statusnya, dan itu memang disengaja: pembeli tamu tidak punya akun untuk login.

```
GET /api/deposits/<depositId>/status
```

Sama, tapi **menuntut sesi login** — deposit selalu milik akun terdaftar.

---

## 5. Endpoint publik lain

```
GET /api/search?q=<kata>
```

Pencarian produk untuk kotak cari di header. Dibatasi laju per IP.

```
POST /api/track
Body: { "path": "/kategori/produk", "sessionId": "..." }
```

Pelacak kunjungan. Dipanggil dari halaman storefront publik saja — panel admin dan halaman akun **tidak dilacak**, supaya trafik kerjamu sendiri tidak mengotori analytics.

Path dinormalkan sebelum disimpan: query string dibuang, dan segmen identitas diganti penanda (`/invoice/:token`, `/account/deposit/:id`) supaya laporan "halaman terpopuler" tidak pecah jadi ribuan baris unik.

Dibatasi 60 permintaan per menit per IP.

---

## 6. Endpoint panel admin

```
GET /api/admin/analytics/live        izin: system.manage
GET /api/admin/provider-logs         izin: payments.manage
GET /api/admin/provider-price-list   izin: payments.manage
```

Ketiganya memakai gerbang yang sama dengan seluruh aksi admin (`requireAdminSession`), termasuk **pemeriksaan ulang ke database** — bukan sekadar percaya isi token.

Alasannya: token sesi di sini stateless dan berumur panjang, jadi sesi yang haknya sudah dicabut tetap membawa peran lama sampai tokennya kedaluwarsa.

**`/api/admin/analytics/live` memakai polling, bukan koneksi terbuka.** Di runtime serverless, koneksi yang dibiarkan terbuka dibayar per detik selama halaman masih dibuka — satu tab admin yang lupa ditutup semalaman jadi tagihan semalam penuh.

---

## 7. Rate limit yang berlaku

| Jalur | Batas |
|---|---|
| `POST /login` | 5 per menit per IP |
| Kegagalan login | 5 gagal → akun dikunci 15 menit |
| `POST /register` | 3 per menit per IP |
| Checkout tamu | 3 per menit per IP |
| Cek ID game | 15 per menit per IP |
| Cek transaksi | 5 per menit per IP |
| `/api/v1/*` (mitra) | 300 per menit per IP |
| Webhook Midtrans | 60 per menit |
| `/api/cron/tick` | 10 per menit |
| `/api/track` | 60 per menit per IP |

Semuanya **fail-open**: kalau database bermasalah, permintaan diloloskan alih-alih menolak semua orang. Gangguan database tidak boleh berubah jadi toko yang mati total.
