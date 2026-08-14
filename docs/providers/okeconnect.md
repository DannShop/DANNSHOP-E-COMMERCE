# OkeConnect (OrderKuota) — Riset Provider H2H

**Status: RISET SELESAI & TERVERIFIKASI. Adapter belum dibangun.**
Tanggal riset: 2026-08-14.

**OkeConnect = lengan H2H-nya OrderKuota.** Ini terkonfirmasi dari dua arah: ketiga
dokumentasi Postman yang dikirim CS OrderKuota semuanya berjudul "… Okeconnect" dan
owner-nya sama (`5338218`), dan sumber pihak ketiga konsisten menyebut OkeConnect sebagai
layanan H2H milik OrderKuota. Jadi provider `OKECONNECT` yang sudah terdaftar di
`enum ProviderKey` (`web/prisma/schema.prisma:17-22`) memang target yang benar — tidak perlu
enum baru.

## 0. Ketiga dokumentasi dari CS — mana yang relevan

| Dokumen | Isi sebenarnya | Relevan? |
|---|---|---|
| [API Transaksi All Software](https://documenter.getpostman.com/view/5338218/2s93ecv9cE) — judul asli **"API H2H Okeconnect"** | Beli produk digital (pulsa, data, game, PLN, e-wallet) — **ini yang kita cari** | ✅ YA |
| [API Payment H2H Alfa Indo Realtime](https://documenter.getpostman.com/view/5338218/2s93eWyscG) — **"API Alfa & Indomaret Okeconnect"** | **Terima pembayaran** via Alfamart/Indomaret/Alfamidi/Dandan/Lawson (`gateway.okeconnect.com/api/retail/inquiry`) | ❌ bukan beli produk |
| [API Payment H2H VA Realtime](https://documenter.getpostman.com/view/5338218/2s93eVXDsa) — **"API Virtual Akun Okeconnect"** | **Terima pembayaran** via VA (Mandiri, BRI, BNI, Permata, BSI, CIMB, Muamalat) (`gateway.okeconnect.com/api/va/inquiry`) | ❌ bukan beli produk |

Tebakan awal benar: yang dipakai adalah yang pertama.

> **Catatan sampingan yang layak diingat (bukan untuk sekarang):** dua dokumen "Payment"
> itu sebenarnya **payment gateway** — VA multi-bank + pembayaran retail minimarket, dengan
> signature `md5(merchantCode + merchantOrderId + paymentAmount + mKey)` dan callback POST.
> Mengingat QRIS kita masih terblokir izin PJP + Core API Midtrans
> (`docs/07-AKTIVASI-CORE-API-MIDTRANS.md`), ini kandidat **jalur pembayaran alternatif**
> yang layak dilirik terpisah dari urusan provider produk. Jangan dikerjakan sekarang —
> catat saja.

---

## 1. Endpoint — sudah terverifikasi

Base URL transaksi: **`https://h2h.okeconnect.com`**
Semua operasi transaksi memakai **HTTP GET dengan parameter di query string**.

### 1.1 Cek saldo
```
GET https://h2h.okeconnect.com/trx/balance?memberID=OK00123&pin=123456&password=secret
```
Respons (teks polos): `Saldo 284.939` — gagal: `Pin Salah`

### 1.2 Transaksi nominal tetap
```
GET https://h2h.okeconnect.com/trx?product=T1&dest=089660522887&refID=114&memberID=OK00123&pin=123456&password=secret
```
| Parameter | Wajib | Keterangan |
|---|---|---|
| `memberID` | ya | Kode user, contoh `OK00123` |
| `product` | ya | Kode produk, contoh `T1`, `T5`, `DML12` |
| `dest` | ya | Nomor/ID tujuan |
| `refID` | ya | Nomor referensi unik dari kita |
| `pin` | ya | PIN transaksi |
| `password` | ya | Password transaksi H2H (beda dari password login web) |

Sukses: `T#210286229 R#113 Three 1.000 T1.089660522887 akan diproses. Saldo 279.655 - 1.321 = 278.334 @19:08`
Gagal: `R#0 T1.089660522887 GAGAL. Pin Salah`

### 1.3 Transaksi nominal bebas (open denom)
Sama seperti di atas + `qty` = nominal (min 10.000, maks 10.000.000):
```
GET /trx?product=BBSDN&dest=085736044280&qty=12345&refID=7777&memberID=…&pin=…&password=…
```

### 1.4 Cek status transaksi
Endpoint yang **sama persis** dengan transaksi, ditambah `check=1` (dan `qty` kalau open denom):
```
GET /trx?product=T5&dest=08980204060&refID=999&memberID=…&pin=…&password=…&check=1
```
Empat bentuk respons:
- **Sukses** — `R#999 Three 5.000 T5.08980204060 sudah pernah jam 18:46, status Sukses. SN: R25042218462100b7. Hrg 6.487 …`
- **Gagal** — `… status Gagal. Mohon diperiksa kembali No tujuan sebelum di ulang. Hrg 6.487 …`
- **Pending** — `Mhn tunggu trx sblmnya selesai: T#762221212 R#999 T5.08980204060 @18:46, status Menunggu Jawaban. …`
- **Tidak ada data** — `TIDAK ADA transaksi Tujuan 08980204060 pada tgl 22/04/2025. Tidak ada data. …`

> Ini cocok dengan deviasi yang sudah ada di kontrak kita: `checkStatus(input: CreateTrxInput)`
> menerima input lengkap, bukan cuma `refId` (`web/src/lib/providers/types.ts:56-58`). Alasan
> deviasi itu (Digiflazz) ternyata berlaku juga di sini — kontrak tidak perlu diubah.

### 1.5 Callback
```
GET {url_callback}?refid=114&message=<pesan URL-encoded>
```
Contoh pesan sukses: `T#210288912 R#114 Three 1.000 T1.089660522887 SUKSES. SN: R230512.1911.2100F1. Saldo 278.334 - 1.321 = 277.013 @12/05 19:11`
Contoh pesan gagal: `T#41169572 R#1235 Telkomsel 5.000 S5.082280004280 GAGAL. Nomor tujuan salah. Saldo 10.795.667 @22:15`

URL callback diset di dashboard: `okeconnect.com/integrasi/trx_ip` (butuh login).

**Isi halaman dashboard itu (dikonfirmasi dari akun DannShop, 2026-08-14):**

| Field | Nilai / sifat |
|---|---|
| IP Center | `https://h2h.okeconnect.com/trx` — **`103.139.245.61`** |
| User ID | `OK307834` (ini `memberID`) |
| URL Callback | **satu slot saja**, saat ini terisi `https://bukaolshop.net/callback/okeconnect/event` |
| IP Address | **boleh lebih dari satu, dipisah koma** — saat ini `147.139.174.214` |
| Password | tersimpan (ini `password` H2H, bukan password login web) |
| Status | Aktif |

Dikonfirmasi lewat DNS (2026-08-14): `h2h.okeconnect.com` memang resolve ke `103.139.245.61`,
jadi angka "IP Center" itu = IP server H2H mereka. **Belum tentu sama dengan IP asal callback** —
masih perlu dikonfirmasi CS sebelum dipakai sebagai filter (§3.5 poin 3).

Catatan: host price list (`okeconnect.com`) ada di belakang Cloudflare, infrastruktur berbeda
dari host transaksi yang ber-IP tunggal.

⚠️ **KONFLIK: slot URL Callback cuma SATU dan sedang dipakai BukaOlshop.** Mengarahkannya ke
DannShop akan mematikan callback BukaOlshop di akun yang sama. Kolom IP tidak bermasalah
(boleh banyak, tinggal tambah IP relay pakai koma) — yang berebut hanya callback. Opsi
penyelesaiannya ada di §4.1.

### 1.6 Price list — **TIDAK ADA di dokumentasi Postman, tapi ADA dan sudah diverifikasi live**
```
GET https://okeconnect.com/harga/json?id=<token_harga_member>
```
Host-nya **beda** dari host transaksi, dan **tidak** memakai `memberID`/`pin`/`password` —
hanya satu token `id` di query string.

Diverifikasi 2026-08-14: HTTP 200, `application/json`, **8.153 produk**, ~1,2 MB. Bentuk tiap baris:
```json
{"kode":"SMDC150","keterangan":"Smart 30GB All + 60GB (01-05) 30 Hari",
 "produk":"Data Smart Combo","kategori":"KUOTA SMARTFREN","harga":"134600","status":"1"}
```

**Pemetaan ke `ProviderSkuPrice` kita (`types.ts:3-10`) — pas semua, tanpa paksaan:**

| Field kita | Dari OkeConnect | Catatan |
|---|---|---|
| `skuCode` | `kode` | |
| `productName` | `keterangan` | |
| `category` | `kategori` | 23 kategori |
| `brand` | `produk` | sub-produk, mis. `TPG Diamond Mobile Legends` |
| `costPrice` | `harga` | **string** → `BigInt`, rupiah utuh |
| `available` | `status === "1"` | `"1"` aktif / `"0"` non-aktif |

⚠️ **`harga` BISA NEGATIF DAN BISA NOL — jangan diasumsikan positif.** Diverifikasi pada data
live: dari 8.153 produk, **1.115 berharga negatif** dan **1.181 berharga `0`**.

- **Negatif** (kategori `AIR PDAM` 364, `TAGIHAN PBB` 353, `FINANCE` 244, `TAGIHAN` 131,
  `PASCABAYAR` 22, `NOMINAL BEBAS` 1) — ini produk **tagihan/pascabayar**, dan angkanya bukan
  harga modal melainkan **komisi yang kita terima**. Nominal tagihan yang sebenarnya baru
  ketahuan saat inquiry, bukan dari price list. Contoh: `BPLA` (Bayar Tagihan Listrik) `-1150`,
  `BBPJS` `-1800`.
- **Nol** — termasuk produk cek-ID (`CEKML` dkk) dan sebagian lain.

Bahayanya konkret: guard `costPrice > sellingPrice` di `selectFulfillmentSku` yang mencegah
jual rugi **selalu lolos** kalau `costPrice` negatif. Ditambah lagi, dokumentasi OkeConnect
**tidak punya endpoint inquiry sama sekali** — cuma `/trx`, `/trx/balance`, dan `check=1` —
jadi alur pascabayar memang tidak terlayani API ini sebagaimana adanya.

**Keputusan: saring keluar kategori tagihan/pascabayar saat sync** (`TAGIHAN`, `TAGIHAN PBB`,
`AIR PDAM`, `FINANCE`, `PASCABAYAR`), dan tolak `harga <= 0` untuk produk yang bisa dijual.
DannShop hanya menjual prabayar (game, pulsa, data, token PLN, e-money) yang semuanya
berharga positif, jadi penyaringan ini tidak mengurangi apa pun yang kita jual.

✅ **Token `id` TERNYATA BUKAN kredensial, dan BUKAN per-member.** (Dugaan awal riset ini
salah dan sudah dikoreksi.) Diverifikasi 2026-08-14 dengan menyetir browser Wildan yang
sedang login sebagai DANNSHOP: token di halaman `okeconnect.com/harga` miliknya adalah
`905ccd028329b0a` — **sama persis** dengan token di dokumentasi open-source pihak ketiga.
Fetch dari dalam sesi login menghasilkan data yang identik dengan fetch anonim: 8.153 produk,
23 kategori dengan jumlah yang sama, `DML12 = 3383`. Sebelumnya juga dicek silang terhadap
10 baris yang disalin Wildan dari dashboard-nya — **10 dari 10 cocok persis**.

Artinya: **daftar harga OkeConnect sama untuk semua member**, tidak ada tier per-akun di
level price list ini. Konsekuensi praktis:
- Token cukup jadi **konstanta/konfigurasi biasa**, tidak perlu masuk
  `ProviderConfig.credentials` yang terenkripsi.
- Harga modal yang dianalisis di dokumen ini **memang harga modal kita** — jadi perbandingan
  dengan Digiflazz bisa dilakukan kapan saja tanpa menunggu kredensial apa pun.
- Tetap simpan sebagai konfigurasi yang bisa diubah, bukan hardcode di tengah kode — kalau
  suatu saat OkeConnect mengganti token, jangan sampai perlu deploy ulang untuk memperbaikinya.

Catatan kecil: kode `T1` yang dipakai sebagai contoh di dokumentasi resmi **sudah tidak ada**
di price list saat ini — contoh di dokumentasi mereka memang tidak selalu sinkron dengan data
hidup. Jangan pakai kode dari dokumentasi sebagai acuan; selalu ambil dari price list.

---

## 2. Katalog produk — apakah cocok untuk DannShop?

**Ya, game top-up ADA** — tapi tidak kelihatan dari nama kategori, karena semuanya
dilebur ke dalam satu kategori `DIGITAL` (646 item).

23 kategori: `CETAK VOUCHER` (1095), `AIR PDAM` (726), `TAGIHAN PBB` (706), **`DIGITAL` (646)**,
`KUOTA INDOSAT` (554), `FINANCE` (492), `DOMPET DIGITAL` (481), `KUOTA TRI` (477), `KUOTA XL` (381),
`BULK CASHBACK` (375), `KUOTA TELKOMSEL` (330), `PASCABAYAR` (292), `TAGIHAN` (268), `PULSA` (231),
`KUOTA AXIS` (216), `BULK TELKOMSEL` (191), `KUOTA SMARTFREN` (190), `KUOTA NASIONAL` (155),
`TOKEN PLN` (122), `SMS TELEPON` (109), `KUOTA BYU` (74), `NOMINAL BEBAS` (37), `PULSA TRANSFER` (5).

Isi `DIGITAL` yang relevan buat kita:

| Sub-produk (`produk`) | Jumlah SKU |
|---|---|
| TPG Diamond Mobile Legends | 114 |
| TPG Diamond Free Fire | 58 |
| TPG Game Mobile PUBG | 26 (+21 PUBG Global) |
| TPG Werewolf | 22 |
| TPG Game Vcr Roblox | 19 |
| TPG Magic Chess Go Go | 16 |
| TPG Lokapala | 13 |
| TPG Honor of Kings / Zepeto | 12 masing-masing |
| TPG Arena Breakout / Delta Force | 11 masing-masing |
| Call of Duty, Arena of Valor, Clash of Clans, Clash Royale, Point Blank, Steam, Google Play, Razer Gold, UniPin, FC Mobile, dll | 5–8 masing-masing |
| Top Up Saldo Doku / InDriver / Shopee Driver / Maxim | 24–31 masing-masing |

Contoh SKU Mobile Legends: `DML12` (12 diamond), `DML36`, `DML86`, `DML172`, `DML257`,
`DML344`, `DML429`, `DML600`, `MLSA` (Starlight), `MLSC` (Starlight Plus), `MLSB` (Twilight Pass).

**Bonus: ada produk cek-ID/nickname** (`produk = "Cek Produk Digital H2H"`, 14 SKU, harga 0):
`CEKML` (cek nama pengguna Mobile Legend), `CEKFF`, `CEKAOV`, `CEKCODM`, `CEKPLN`, `CEKD` (Dana),
`CEKGJK` (Gopay), `CEKSHP` (ShopeePay), `CEKOVO`, `CEKLINK`, dll. Ini berpotensi jadi alternatif
untuk `web/src/app/actions/id-check.ts` yang sekarang menembak URL eksternal yang diisi admin.
Perhatikan: pada price list yang diperiksa, sebagian status-nya `0` (mis. `CEKML`, `CEKFF`
non-aktif; `CEKAOV`, `CEKCODM`, `CEKPLN` aktif) — ketersediaannya bisa berbeda per akun/waktu.

---

## 3. Perbedaan mendasar vs Digiflazz — ini yang menentukan kerjaan adapter

Adapter OkeConnect **tidak bisa** dibuat dengan menyalin `DigiflazzAdapter` lalu ganti URL.
Lima perbedaan struktural:

### 3.1 Respons TEKS POLOS, bukan JSON ⚠️ ini yang terberat
Digiflazz membalas JSON terstruktur dengan `rc` (`00` sukses, `03` pending) — status dibaca
dari satu field. OkeConnect membalas **kalimat bahasa Indonesia** ber-`Content-Type: text/html`.
Status harus disimpulkan dari isi kalimat:

- transaksi diterima → mengandung `"akan diproses"`
- callback/cek status sukses → `"SUKSES."` atau `"status Sukses"` + `SN:` untuk serial number
- gagal → `"GAGAL."` atau `"status Gagal"`
- pending → `"Menunggu Jawaban"` / `"Mhn tunggu trx sblmnya selesai"`
- tidak ditemukan → `"TIDAK ADA transaksi"` / `"Tidak ada data"`

**Risiko nyata**: parser berbasis kecocokan teks itu rapuh — kalimat provider bisa berubah
sewaktu-waktu tanpa pemberitahuan, dan salah baca di jalur ini = salah tandai order (uang).
Konsekuensi desain yang wajib: **default aman = `pending`, bukan `failed` atau `success`.**
Kalimat yang tidak dikenali harus jatuh ke pending supaya job `recheck-fulfillment` yang
memutuskan, bukan tebakan parser. Parser ini juga wajib punya tes unit yang mengunci
kelima bentuk kalimat di atas apa adanya.

Efek samping ke enum yang sudah ada: `ProviderApiOutcome.INVALID_RESPONSE` sekarang
didokumentasikan sebagai *"dapat respons, tapi bukan JSON yang bisa dibaca"*
(`api-log.ts:36`) — untuk OkeConnect, teks polos justru respons yang SAH. Maknanya perlu
digeser jadi "respons tidak bisa ditafsirkan", bukan "bukan JSON".

### 3.2 Kredensial ada di URL — bahaya kebocoran log ⚠️ MONEY/SECURITY
`redactProviderRequest` (`api-log.ts:88-104`) sudah meredaksi key `pin`, `password`, `token`
— **tapi hanya kalau request dikirim sebagai objek**. Masalahnya, `ProviderApiLog.endpoint`
disimpan **apa adanya tanpa redaksi** (`api-log.ts:150`). Digiflazz aman karena dia POST JSON
(URL-nya bersih). OkeConnect GET → **PIN dan password ada di dalam URL itu sendiri**.

Kalau adapter menaruh URL lengkap ke field `endpoint`, PIN + password tersimpan polos di
database, terbaca dari halaman admin, dan ikut ter-dump tiap backup DB. **Adapter WAJIB
mengisi `endpoint` dengan path bersih saja** (mis. `https://h2h.okeconnect.com/trx`) dan
menaruh parameter di `requestBody` sebagai objek supaya kena redaksi yang sudah ada.
Idealnya `endpoint` juga dibuat kebal secara struktural (buang query string sebelum simpan),
supaya adapter provider berikutnya tidak bisa mengulangi kesalahan yang sama.

### 3.3 Relay IP-tetap belum mendukung GET ⚠️
OkeConnect mewajibkan **IP whitelist**, dan runtime Vercel tidak punya IP keluar tetap —
persoalan yang persis sama dengan Digiflazz `rc 45` (`docs/08-IP-TETAP-DIGIFLAZZ.md`). Jadi
relay PHP harus dipakai ulang. Tapi `web/src/lib/providers/relay.ts` saat ini **hanya punya
`providerHttpPost`** (POST + body JSON). OkeConnect butuh **GET + query string**, jadi:
- `relay.ts` perlu tambahan `providerHttpGet`, dan
- `relay/digiflazz-relay.php` perlu mendukung meneruskan GET (dan sebaiknya di-rename,
  karena namanya sudah tidak lagi Digiflazz-spesifik).

Aturan "tidak ada fallback langsung kalau relay mati" (`relay.ts:41-46`) harus dipertahankan
dengan alasan yang sama.

### 3.4 Format `refID` — belum pasti, dan ini kunci anti-double-charge ⚠️
`generateRefId` kita menghasilkan `PREFIX-20260814123045-AB12CD`
(`web/src/lib/order/order-number.ts:22-36`) — panjang, ada huruf dan tanda hubung.
**Semua contoh refID di dokumentasi OkeConnect angka pendek**: `114`, `999`, `1235`, `7777`.
Dokumentasi tidak menyebut panjang maksimum maupun karakter yang diizinkan.

`refID` adalah satu-satunya kunci idempotency (dokumentasi eksplisit: *"refID harus unik
untuk setiap transaksi"*), dan cek status mencocokkan berdasarkan itu. Kalau OkeConnect
diam-diam memotong atau menolak refID kita, akibatnya bukan error yang kelihatan — bisa jadi
transaksi terkirim dua kali atau status tidak pernah cocok. **Ini harus diuji langsung
dengan transaksi nominal terkecil sebelum apa pun diaktifkan**, jangan diasumsikan.

### 3.5 Callback TANPA verifikasi keaslian sama sekali 🚨 PALING SERIUS
Digiflazz menandatangani callback-nya dengan `X-Hub-Signature: sha1=HMAC(raw_body, secret)`,
dan endpoint kita fail-closed kalau `webhookSecret` kosong (`docs/04-…` §3.7).
**Callback OkeConnect tidak punya signature, secret, maupun token apa pun** — hanya
`?refid=…&message=…` lewat GET. Siapa pun yang tahu (atau menebak) URL callback kita bisa
mengarang `message` berisi `"SUKSES. SN: ..."` dan menandai order sebagai berhasil.

Ini gap uang nyata, dan **tidak bisa ditutup dari sisi OkeConnect**. Mitigasi yang harus
dibangun berlapis:
1. **Jangan pernah percaya isi `message` sebagai keputusan akhir.** Perlakukan callback
   semata-mata sebagai *pemicu* untuk memanggil `checkStatus` (`check=1`) — persis pola yang
   sudah kita terapkan ke Midtrans ("jangan percaya body webhook mentah, GET status ulang",
   `docs/04-…` §2.6 langkah 6). Pola ini sudah terbukti di codebase, tinggal diterapkan lagi.
2. **URL callback yang tidak bisa ditebak** — sisipkan segmen acak panjang di path-nya.
3. **Batasi berdasarkan IP asal** kalau OkeConnect mau memberikan daftar IP pengirim callback
   (perlu ditanyakan ke CS).
4. Tetap lewati `WebhookEvent` untuk idempotency seperti jalur webhook yang sudah ada.

---

## 4. Yang masih harus Wildan ambil/tanyakan (tidak bisa didapat dari riset)

Sudah didapat dari dashboard: `memberID` = `OK307834`, IP whitelist bisa multi-IP,
password H2H sudah ada di form.

Token price list ✅ **sudah didapat dan ternyata bukan rahasia** — lihat §1.6.

Masih kurang:
- [ ] **PIN transaksi** — tidak ada di halaman Transaksi IP; ini yang didapat saat pendaftaran.
      Diisi langsung oleh Wildan di `/admin/providers` (terenkripsi di DB), tidak pernah
      lewat chat maupun env var.
- [ ] Tambahkan **IP relay Rumahweb** ke kolom IP Address (pakai koma, jangan menimpa
      `147.139.174.214` yang sudah ada)
- [ ] Ganti **URL Callback** ke DannShop (lihat §4.1 — sudah diputuskan diambil alih)

### 4.0 Field baru di `/admin/providers`

`provider-card.tsx` saat ini field-nya masih khusus Digiflazz (`username`, `apiKey`,
`webhookSecret`). Kartu OkeConnect butuh: **User ID** (`OK307834`), **PIN** (type password),
**Password H2H** (type password). Token price list **tidak** masuk sini (§1.6).

### 4.1 Callback — KEPUTUSAN: diambil alih DannShop

**Diputuskan 2026-08-14:** URL callback dialihkan dari BukaOlshop ke DannShop; BukaOlshop
sudah tidak dipakai lagi setelah punya web sendiri. Tidak ada forwarding, tidak perlu
akun kedua.

Konsekuensinya: **risiko callback palsu di §3.5 kembali berlaku penuh** dan wajib dimitigasi,
karena kita membuka endpoint yang tidak bisa diverifikasi keasliannya oleh provider.
Empat lapis yang harus ada semua, bukan pilih salah satu:

1. **Callback hanya PEMICU, bukan sumber kebenaran.** Isi `message` tidak pernah dipakai
   memutuskan status. Terima callback → panggil `checkStatus` (`check=1`) → status dari
   situlah yang menentukan. Persis pola Midtrans (`docs/04-…` §2.6 langkah 6) yang sudah
   terbukti. Ini lapis terpenting; tiga sisanya cuma memperkecil permukaan.
2. **Path callback tidak bisa ditebak** — sisipkan segmen acak panjang, mis.
   `/api/webhooks/okeconnect/<32-hex-acak>`. Bukan pengganti verifikasi, cuma pengurang bising.
3. **Batasi IP asal.** Kandidat: `103.139.245.61` (IP `h2h.okeconnect.com`). **Belum
   dikonfirmasi** callback benar-benar berasal dari IP itu — tanyakan CS dulu, dan pasang
   sebagai mode "catat kalau tidak cocok" sebelum benar-benar memblokir, supaya tidak
   diam-diam membuang callback yang sah.
4. **Idempotency lewat `WebhookEvent`** seperti jalur webhook yang sudah ada — `refid` yang
   sama tidak boleh diproses dua kali.

Karena lapis 1 sudah membuat callback tidak menentukan apa pun sendirian, `recheck-fulfillment`
tetap wajib dijadwalkan seperti biasa. Callback cuma mempercepat, tidak menggantikan.

Yang perlu ditanyakan ke CS OrderKuota/OkeConnect:
- [ ] **Batas panjang & karakter `refID`** — boleh alfanumerik + tanda hubung? maksimal berapa
      karakter? (§3.4 — ini penentu, jangan ditebak)
- [ ] Adakah **daftar IP pengirim callback** yang bisa kami whitelist? (§3.5)
- [ ] Apakah callback di-retry kalau server kami tidak membalas 2xx, dan berapa kali?
- [ ] Format `dest` untuk produk game yang butuh dua input (Mobile Legends: user ID + zone ID) —
      digabung tanpa pemisah, atau pakai pemisah tertentu?
- [ ] Apakah ada rate limit pada `/trx` dan pada endpoint price list?

Keputusan bisnis yang belum bisa dijawab riset ini:
- [ ] **Bandingkan harga modal OkeConnect vs Digiflazz** untuk SKU yang benar-benar kita jual.
      Angka di price list yang diperiksa adalah tier member lain, jadi tidak bisa dijadikan
      dasar. Setelah token sendiri didapat, ambil kedua price list dan bandingkan SKU per SKU.

---

## 5. Rencana implementasi (kalau lampu hijau)

Urutan yang membuat tiap langkah bisa diverifikasi sebelum menyentuh uang:

1. **`providerHttpGet` di `relay.ts` + dukungan GET di relay PHP** (§3.3). Diverifikasi lewat
   cek saldo — operasi paling tidak berbahaya, read-only, dan langsung membuktikan
   kredensial + whitelist IP sudah benar.
2. **Parser respons teks** sebagai modul terpisah (`okeconnect-parse.ts`) dengan tes unit yang
   mengunci kelima bentuk kalimat di §3.1, **default aman ke `pending`**. Dipisah dari adapter
   supaya bisa diuji tanpa jaringan sama sekali.
3. **`fetchPriceList()`** — pemetaan di §1.6 sudah pas dengan `ProviderSkuPrice`, jadi
   `price-sync.ts` dan `ProviderPriceListCache` seharusnya jalan tanpa perubahan skema.
   Ini juga langkah yang memberi Wildan data pembanding harga (§4).
4. **Perbaiki kebocoran `endpoint` di `api-log.ts`** (§3.2) — dikerjakan **sebelum** panggilan
   transaksi pertama, bukan sesudah, supaya PIN tidak pernah sempat tersimpan sekali pun.
5. **`createTransaction()` + `checkStatus()`**, lalu uji dengan SKU termurah (mis. pulsa
   Rp1.000 / `DML12`) untuk sekalian membuktikan format `refID` (§3.4).
6. **Endpoint callback** dengan keempat lapis mitigasi di §4.1 — dibangun **paling akhir**,
   setelah `checkStatus` (langkah 5) terbukti jalan, karena lapis pertama justru bersandar
   penuh pada `checkStatus`. Membangunnya lebih dulu berarti punya endpoint yang belum bisa
   memverifikasi apa pun.
7. Baru daftarkan adapter di `registry.ts` (`case "OKECONNECT"`) dan aktifkan lewat
   `/admin/providers`.

Jaring pengaman yang sudah ada dan otomatis berlaku begitu adapter terdaftar: kill-switch
`isActive`, `allowInactive` untuk cek status (`registry.ts:25-30`), dan penolakan
`costPrice > sellingPrice` → `NEEDS_REVIEW` di `selectFulfillmentSku`.

## Sumber

- [API Transaksi All Software / "API H2H Okeconnect" (Postman)](https://documenter.getpostman.com/view/5338218/2s93ecv9cE)
- [API Payment H2H Alfa Indo Realtime (Postman)](https://documenter.getpostman.com/view/5338218/2s93eWyscG)
- [API Payment H2H VA Realtime (Postman)](https://documenter.getpostman.com/view/5338218/2s93eVXDsa)
- [NdraDev/okeconnect-php-client — `docs/okeconnect.txt`](https://github.com/NdraDev/okeconnect-php-client) — satu-satunya sumber yang menyebut endpoint price list
- [Packagist: ndradev/okeconnect-php-client](https://packagist.org/packages/ndradev/okeconnect-php-client)
- Verifikasi langsung `GET https://okeconnect.com/harga/json?id=…` (2026-08-14)
