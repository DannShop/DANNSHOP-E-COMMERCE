# IP Tetap untuk Digiflazz (rc 45 — "IP Anda tidak kami kenali")

## Masalahnya

Digiflazz cuma melayani request dari IP yang sudah didaftarkan di whitelist akun
mereka. Request dari IP lain ditolak dengan:

```json
{ "data": { "rc": "45", "status": "Gagal", "message": "IP Anda tidak kami kenali: 47.129.212.98" } }
```

Aplikasi ini berjalan di **Vercel, yang tidak punya IP keluar tetap.** Tiap
invocation function bisa keluar dari IP AWS mana saja. Jadi:

> **Mendaftarkan IP yang disebut di pesan error itu TIDAK menyelesaikan apa pun.**
> Besok request berikutnya keluar dari IP lain, dan gagal lagi dengan pesan sama.

Ini juga bukan bug kode: request-nya benar, sign-nya benar, kredensialnya benar.
Yang salah cuma **dari mana request itu keluar**.

## Solusinya: relay ber-IP tetap

```
Vercel (IP acak)  ──▶  relay di hosting kamu (IP TETAP)  ──▶  api.digiflazz.com
                              ▲
                       cukup IP INI yang didaftarkan sekali di Digiflazz
```

Shared hosting biasa sudah cukup — IP shared hosting itu tetap, dan relay-nya cuma
satu file PHP (`relay/digiflazz-relay.php` di repo ini). Tidak perlu VPS, tidak
perlu Node, tidak perlu langganan tambahan.

Alternatif berbayar kalau nanti mau: **Vercel Static IPs** ($100/bulan per project,
plan Pro/Enterprise — nol perubahan kode, tinggal aktifkan di Settings → Networking),
atau proxy pihak ketiga seperti QuotaGuard/Fixie.

---

## Langkah pemasangan

### 1. Siapkan secret

Bikin string acak panjang, misalnya:

```bash
openssl rand -hex 32
```

Simpan — dipakai di dua tempat dan **harus sama persis**.

### 2. Upload relay ke hosting — TANPA secret dulu

Urutannya penting. **Upload file dalam keadaan masih berisi placeholder, isi
secret-nya belakangan (langkah 2b).**

Alasannya: kalau hosting/domain itu ternyata tidak menjalankan PHP, file `.php`
akan disajikan sebagai **teks biasa** — siapa pun yang membuka URL-nya bisa membaca
seluruh isinya, termasuk `RELAY_SECRET`. Meng-upload placeholder lebih dulu membuat
kemungkinan itu ketahuan tanpa ada yang bocor.

**2a. Upload:**

1. Buka File Manager hosting. Di Hostinger: **hPanel → Websites → (pilih domain) →
   File Manager** — cara ini membuka folder yang benar secara otomatis.
2. Pastikan kamu berada di folder yang **berisi `index.html`/`index.php` milik situs
   yang sedang tayang di domain itu**. Itulah docroot-nya. Untuk domain utama
   biasanya `public_html/`; untuk addon domain sering `public_html/namadomain.com/`
   — jangan berasumsi, cocokkan dengan file situs yang sudah ada.
3. Upload `relay/digiflazz-relay.php` dari repo ini ke folder tersebut, **apa
   adanya** (jangan diedit dulu).
4. Buka `https://domain-kamu.com/digiflazz-relay.php?ping=1` di browser.

   | Yang muncul | Artinya |
   |---|---|
   | `{"ok":false,"error":"RELAY_SECRET ... belum diganti ..."}` | **PHP jalan.** Lanjut ke 2b |
   | Kode PHP mentah (`<?php ...`) | **PHP TIDAK jalan** di domain ini — hapus file itu sekarang, jangan isi secret. Lihat catatan di bawah |
   | 404 | File belum sampai, atau salah folder — ulangi poin 2 |

**2b. Baru isi secret:**

1. Klik kanan file → **Edit**, ganti baris:
   ```php
   const RELAY_SECRET = 'GANTI-DENGAN-STRING-ACAK-PANJANG';
   ```
   dengan secret dari langkah 1, lalu simpan.
2. Disarankan: rename filenya jadi sesuatu yang tidak mudah ditebak (misal
   `x9f2c-relay.php`) — URL-nya jadi lebih sulit ditemukan orang.

> **Kalau PHP tidak jalan di domain itu:** cek apakah domainnya diarahkan ke
> hosting statik/CDN, bukan ke hosting PHP-nya. Relay ini bisa ditaruh di domain
> ATAU subdomain mana pun yang menjalankan PHP di akun hosting yang sama — yang
> menentukan adalah IP keluar servernya, bukan nama domainnya.

### 3. Pastikan relay hidup, dan catat IP keluarnya

```bash
curl -H "x-relay-secret: SECRET-KAMU" "https://domain-kamu.com/digiflazz-relay.php?ping=1"
```

Harus membalas:

```json
{"ok":true,"relay":"digiflazz","php":"8.x.x","curl":true,"ip_keluar":"103.x.x.x","server_addr":"103.x.x.x"}
```

- `curl: false` → minta hosting mengaktifkan ekstensi cURL (biasanya sudah aktif).
- HTTP 403 → secret di file dan di perintah curl belum sama.
- HTTP 500 "RELAY_SECRET belum diganti" → langkah 2 poin 3 terlewat.
- Halaman HTML/404 → path filenya salah.

**`ip_keluar` itu angka yang harus didaftarkan** — bukan `server_addr`. Keduanya
sering sama, tapi banyak shared hosting melakukan koneksi keluar lewat NAT dengan
alamat yang berbeda dari alamat web-nya; mendaftarkan yang salah bikin gejalanya
persis sama dengan belum mendaftar sama sekali.

Kalau `ip_keluar` bernilai `null`, hosting memblokir koneksi keluar — itu masalah
yang lebih dasar, tanya dukungan hosting sebelum lanjut (relay tidak akan bisa
menghubungi Digiflazz juga).

### 4. Daftarkan IP itu di Digiflazz

Dashboard Digiflazz → **Atur Akun → IP Whitelist** → masukkan `ip_keluar` dari
langkah 3 di kolom **Production IP** → simpan.

Bisa dilakukan sekarang, sebelum kode di-deploy — mendaftarkan IP tidak
mengganggu apa pun yang sedang berjalan.

### 5. Pasang env di Vercel

Vercel → project → **Settings → Environment Variables**, tambahkan untuk
**Production** (dan Preview kalau perlu):

| Nama | Nilai |
|---|---|
| `PROVIDER_RELAY_URL` | `https://domain-kamu.com/digiflazz-relay.php` |
| `PROVIDER_RELAY_SECRET` | secret dari langkah 1 |

Lalu **redeploy** — environment variable baru tidak berlaku pada deployment lama.

> Kalau salah satu dari dua env ini kosong, aplikasi kembali memanggil Digiflazz
> **langsung** (perilaku lama). Itu disengaja supaya development lokal tetap jalan
> tanpa setup apa pun. Cek jalur mana yang dipakai lewat penanda
> **"via relay" / "langsung"** di setiap baris `/admin/provider-logs`.

### 6. Verifikasi

Klik **Cek Saldo** di Admin → Providers. Kalau saldo muncul, selesai — dan karena
IP relay tidak berubah, ini tidak akan kambuh lagi.

Kalau masih rc 45 di sini padahal langkah 4 sudah dilakukan: pesan errornya
sekarang menyebut **IP relay**, bukan lagi IP Vercel. Bandingkan dengan yang kamu
daftarkan — kalau berbeda, hosting kamu punya lebih dari satu alamat keluar;
daftarkan yang disebut di pesan itu juga.

Lanjutkan dengan satu transaksi tes kecil (**Admin → Providers → Test Transaction**),
lalu cek di **Log API Provider** bahwa outcome-nya `SUCCESS` dan penandanya
"via relay".

---

## Kalau masih gagal

Buka **Admin → Log API Provider**, filter **"Gagal saja"**, lalu cocokkan:

| Yang terlihat | Artinya | Perbaikannya |
|---|---|---|
| rc 45, penanda **"langsung"** | Env relay belum terpasang/terbaca di deployment ini | Ulangi langkah 4, lalu redeploy |
| rc 45, penanda **"via relay"** | Relay jalan, tapi IP-nya belum didaftarkan (atau hosting punya alamat keluar lebih dari satu) | Daftarkan IP yang disebut di pesan itu, ulangi langkah 4 |
| `Relay gagal meneruskan ke provider: ...` | Relay hidup, tapi hosting tidak bisa keluar ke Digiflazz | Tanya hosting apakah outbound HTTPS/cURL diblokir |
| `Relay membalas bukan JSON (HTTP 404/403)` | URL relay salah, atau file diblokir hosting | Cek `PROVIDER_RELAY_URL`, ulangi langkah 3 |
| `Secret tidak cocok` | Secret di file PHP ≠ `PROVIDER_RELAY_SECRET` | Samakan, lalu redeploy |
| `TRANSPORT_ERROR` timeout | Hosting lambat atau sedang down | Cek hosting; kalau sering, pertimbangkan Vercel Static IPs |

## Catatan keamanan

- Relay **hanya** mau meneruskan ke `api.digiflazz.com` dan hanya ke tiga path
  (`/v1/transaction`, `/v1/price-list`, `/v1/cek-saldo`). Jadi walaupun URL-nya
  bocor, file ini tidak bisa dipakai sebagai open proxy ke alamat sembarangan.
- Secret dibandingkan dengan `hash_equals` (waktu-tetap), bukan `===`.
- Verifikasi sertifikat SSL **tidak pernah** dimatikan — relay ini membawa
  kredensial yang bernilai uang.
- API key Digiflazz **tidak pernah** melewati relay dalam bentuk mentah: yang
  dikirim cuma `sign` (hash MD5), sama seperti panggilan langsung.
- Kalau secret bocor, ganti di dua tempat (file PHP + env Vercel) lalu redeploy.
