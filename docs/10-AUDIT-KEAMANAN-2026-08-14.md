# Audit Keamanan — 14 Agustus 2026

> **STATUS TINDAK LANJUT (14 Agu 2026, sore): T-2 dan T-3 SUDAH DIPERBAIKI,
> T-1 sebagian.** Rinciannya di §6 di bawah. Verifikasi: tsc bersih, 467 tes
> lolos, eslint bersih, `npm run build` sukses. Sisa yang belum: kenaikan versi
> `next` (3 kerentanan `high`), sengaja dipisah karena butuh pengujian sendiri.

Cakupan: seluruh `web/src`, skema Prisma, relay PHP, dan dependency produksi.
Fokus pada kelas kerentanan yang relevan untuk aplikasi yang memegang uang:
otorisasi, jalur uang, penanganan rahasia, SSRF/XSS/injeksi, webhook, dan
pembatasan laju.

**Ringkasan: tidak ditemukan lubang kritis di kode aplikasi.** Tiga temuan yang
perlu ditindak, semuanya bisa diperbaiki tanpa perubahan arsitektur. Yang lebih
penting untuk dicatat: banyak hal yang biasanya jadi lubang di aplikasi sejenis
**sudah tertutup dengan benar di sini** — lihat §4, karena itu yang menentukan
apakah temuan di §1 masuk akal untuk diprioritaskan.

---

## 1. Temuan yang perlu ditindak

### T-1 (TINGGI) — 13 kerentanan dependency, 2 di antaranya critical

`npm audit --omit=dev` pada 2026-08-14:

| Paket | Tingkat | Inti masalah | Perbaikan |
|---|---|---|---|
| `next-auth` / `@auth/core` | **critical** | Kesalahan konfigurasi bisa membuat cek auth berbasis keberadaan **fail open** | `npm audit fix` |
| `next` 16.2.10 | tinggi | Bypass middleware/proxy di App Router; DoS lewat Server Actions | naik versi |
| `sharp` <0.35 | tinggi | Rentetan CVE libvips (pemrosesan gambar) | butuh naik `next` |
| `undici` | tinggi | Desinkronisasi respons, kebocoran info antar-pengguna, CRLF injection | `npm audit fix` |
| `postcss` | tinggi | XSS lewat `</style>` tak ter-escape; baca berkas arbitrer via sourceMappingURL | `npm audit fix` |
| `ip-address` | tinggi | Oktet berawalan nol dibaca desimal → **bypass proteksi SSRF** | `npm audit fix` |
| `brace-expansion`, `js-yaml`, `nanoid`, `fast-uri` | tinggi | DoS / host confusion | `npm audit fix` |

**Sudah diperiksa: CVE fail-open `next-auth` TIDAK berlaku untuk kode ini.**
CVE itu memukul pola `if (!session) tolak`. Seluruh 14 salinan `requireAdmin`
memakai cek **positif** — `if (session?.user?.role !== "ADMIN" || !session.user.id)`
— sehingga objek sesi yang terisi error pun tetap ditolak. Tetap wajib dinaikkan
versinya (CVE lain di paket yang sama menyangkut normalisasi email dan crash
pada header `Authorization` cacat), tapi ini **bukan** keadaan darurat.

**Tindakan:** jalankan `npm audit fix` (tidak memutus kompatibilitas) lebih dulu —
itu menutup 9 dari 13. Sisanya (`next`, `sharp`) butuh kenaikan versi `next` yang
harus diuji terpisah, jangan disatukan dengan pekerjaan lain.

---

### T-2 (SEDANG) — Proteksi SSRF cek-ID bisa dilewati lewat redirect

**Berkas:** `web/src/lib/catalog/id-check.ts:114-124` (validator) dan `:180` (fetch)

`validateIdCheckUrl()` memeriksa URL awal: wajib `https:`, dan hostname ditolak
kalau cocok pola alamat privat. Tapi `fetch()` di baris 180 dipanggil **tanpa
opsi `redirect`**, sehingga memakai default `"follow"`.

Akibatnya, host publik yang lolos validasi bisa membalas `302 Location:
http://169.254.169.254/latest/meta-data/...` dan fetch akan mengikutinya —
validasi tidak pernah dijalankan ulang pada URL tujuan redirect.

Celah kedua di validator yang sama: blocklist bekerja pada **teks hostname**,
jadi nama domain publik yang DNS-nya diarahkan ke alamat privat (mis.
`internal.contoh.com → 127.0.0.1`) lolos begitu saja. Bentuk IP alternatif
(desimal `2130706433`, heksadesimal) dan IPv6 unique-local (`fc00::/7`) juga
tidak tercakup regex-nya.

**Kenapa ini layak diperbaiki walau admin tepercaya:** komentar di berkas itu
sendiri menyatakan model ancamannya — *"akun admin yang jebol seharusnya tidak
sekalian memberi akses jaringan dalam."* Celah ini persis membatalkan tujuan itu.
Perbandingan yang menguatkan: relay PHP kita **sudah** menyetel
`CURLOPT_FOLLOWLOCATION => false` untuk alasan yang sama persis
(`relay/digiflazz-relay.php`). Jadi ini bukan standar baru — ini satu tempat yang
tertinggal dari standar yang sudah dipakai di tempat lain.

**Perbaikan (kecil):** tambahkan `redirect: "manual"` pada `fetch` di baris 180,
lalu perlakukan respons 3xx sebagai kegagalan yang bisa dibaca admin. Untuk celah
DNS, resolusi hostname sebelum fetch lalu memvalidasi IP hasilnya — bobotnya jauh
lebih besar dan bisa jadi pekerjaan terpisah; menutup redirect saja sudah
menghilangkan jalur yang paling gampang dipakai.

---

### T-3 (SEDANG) — `Order.publicToken` memakai `cuid()`, bukan pembangkit acak kriptografis

**Berkas:** `web/prisma/schema.prisma:449`

```prisma
publicToken String @unique @default(cuid()) // kunci akses invoice/status API - tidak tertebak
```

Token ini adalah **satu-satunya penjaga** halaman `/invoice/[token]`:
`web/src/app/invoice/[token]/page.tsx:35-36` melakukan `findUnique({ where: {
publicToken } })` tanpa pemeriksaan sesi sama sekali. Siapa pun yang memegang
token melihat email pembeli, nomor/ID tujuan, nominal, dan instruksi pembayaran
(nomor VA / kode QR).

Masalahnya, `cuid()` versi 1 **bukan** CSPRNG. Strukturnya = `c` + stempel waktu +
penghitung + sidik proses + blok acak, dan blok acaknya berasal dari
`Math.random()`. Stempel waktu dan sidik proses bisa ditebak/konstan; yang
tersisa efektif hanya blok `Math.random()`. Keadaan PRNG V8 dapat dipulihkan dari
sejumlah kecil keluaran yang teramati — dan penyerang bisa memperoleh keluaran
itu secara sah dengan membuat beberapa order sendiri. Halaman invoice juga tidak
masuk daftar `RATE_LIMITS` di `proxy.ts` (yang dibatasi hanya
`/api/orders/[id]/status`).

Komentar di skema mengklaim token ini "tidak tertebak" — klaim itu tidak
didukung oleh pembangkitnya.

**Perbaikan:** pakai pembangkit yang sudah ada di repo ini —
`randomToken()` di `web/src/lib/random-token.ts` (memakai `randomBytes` +
rejection sampling, sudah dipakai untuk API key partner dan callback secret).
Cukup isi `publicToken` secara eksplisit saat membuat order alih-alih
mengandalkan `@default(cuid())`. Token lama tetap berlaku; tidak ada migrasi data
yang diperlukan. Pertimbangkan juga menambahkan aturan rate-limit untuk
`/invoice/`.

> Catatan: 31 kolom lain memakai `@default(cuid())`, tapi semuanya **id internal**
> yang tidak pernah jadi kunci akses. Yang perlu diganti hanya `publicToken`.
> Jangan diseragamkan tanpa alasan — mengganti primary key justru berisiko.

---

## 2. Yang diperiksa dan TERNYATA AMAN (sempat dicurigai)

Dicatat supaya tidak diaudit ulang dari nol lain kali.

- **`customCss` admin yang disuntik ke `<style>`** — sempat terlihat seperti
  stored XSS. Ternyata `sanitizeCss()` (`lib/storefront/sanitize-html.ts`)
  membuang `</style`, `</script`, `@import`, `expression()`, dan seluruh `url()`
  kecuali `data:image/`. Diterapkan **saat dibaca**, bukan cuma saat disimpan —
  jadi baris DB yang ditulis lewat jalur lain pun ikut tersaring. Aman.
- **`primaryColor` yang masuk ke `:root{--primary:…}`** — schema Zod-nya memang
  cuma `z.string().trim()`, tapi `getStorefrontAppearance()` menyaringnya lewat
  `sanitizeHexColor()` (regex `^#[0-9a-fA-F]{3,8}$`) sebelum dipakai. Aman.
- **`$queryRaw` di `analytics/query.ts` & `jobs/runner.ts`** — keduanya memakai
  tagged template Prisma, jadi terparameterisasi. Bukan `$queryRawUnsafe`. Aman.
- **Perbandingan signature partner** — `signatureMatches()` menghash KEDUA sisi
  dengan SHA-256 lebih dulu supaya panjangnya selalu sama, mencegah kebocoran
  panjang input penyerang. Lebih teliti daripada `safeCompare` biasa. Aman.
- **Webhook Digiflazz** — `route.ts:40` menolak kalau `!callback.verified`
  (fail-closed saat `webhookSecret` kosong). Aman.
- **14 salinan `requireAdmin`** — dibandingkan isi-per-isi; hanya ada 2 varian dan
  bedanya sebatas koma. Tidak ada salinan yang menyimpang secara logika. Semuanya
  melakukan re-cek segar ke DB atas `role` DAN `updatedAt`, sehingga admin yang
  dicabut aksesnya langsung tertolak walau JWT-nya masih hidup.

---

## 3. Catatan untuk kode OkeConnect yang baru ditambahkan

- Kredensial (`memberID`/`pin`/`password`) berada di **query string** karena API
  OkeConnect memang begitu. Dua lapis mencegahnya tersimpan:
  `sanitizeEndpointForLog()` membuang query string dari kolom `endpoint`, dan
  `redactProviderRequest()` meredaksi `pin`/`password` di `requestBody`.
  Diperbaiki di lapisan log, bukan di adapter — jadi adapter GET berikutnya tidak
  bisa mengulangi kesalahan yang sama.
- `OkeConnectAdapter.parseCallback()` selalu mengembalikan `verified: false`
  karena OkeConnect tidak menandatangani callback-nya sama sekali. **Endpoint
  callback-nya belum dibangun.** Saat nanti dibangun, dia WAJIB memperlakukan
  callback sebagai pemicu saja dan mengambil keputusan status dari `checkStatus`
  — lihat `docs/providers/okeconnect.md` §4.1. Jangan salin pola webhook
  Digiflazz yang bersandar pada `verified`, karena di sini nilainya tidak akan
  pernah `true`.

---

## 4. Kesan umum

Codebase ini **jauh lebih matang secara keamanan** daripada rata-rata aplikasi
PPOB. Yang sudah benar dan sengaja dibangun begitu:

- Klaim atomik (`updateMany` dengan kondisi status) di setiap transisi status
  yang menyentuh uang — mencegah fulfillment/kredit ganda.
- Ledger double-entry dengan `idempotencyKey` unik, dan rollback transaksi saat
  status order berubah di tengah jalan (mencegah refund + barang terkirim).
- Kredensial provider terenkripsi AES-256-GCM di DB, tidak pernah di env var,
  tidak pernah dikirim balik ke browser.
- Webhook Midtrans: verifikasi signature paling awal, idempotency lewat
  `WebhookEvent`, konfirmasi ulang lewat GET status, dan pencocokan nominal.
- Rate limit berlapis: per-IP dan per-email pada login & lupa-password, per-IP
  pada checkout tamu, cek-ID, order-lookup, webhook, cron, dan API partner.
- Penyaring HTML berbasis allowlist untuk markup admin, dengan model ancaman yang
  ditulis eksplisit di berkasnya.

Tiga temuan di §1 tidak mengubah kesan itu — dua di antaranya (T-2, T-3) adalah
satu titik yang tertinggal dari standar yang sudah diterapkan di tempat lain
dalam repo yang sama.

## 5. Urutan pengerjaan yang disarankan

1. ~~`npm audit fix` (T-1 sebagian)~~ ✅ selesai
2. ~~`redirect: "manual"` pada fetch cek-ID (T-2)~~ ✅ selesai
3. ~~`publicToken` pakai `randomToken()` (T-3)~~ ✅ selesai
4. Naikkan versi `next` (sisa T-1) — **terpisah**, karena butuh pengujian sendiri.

---

## 6. Apa yang sudah dikerjakan

### T-1 — sebagian ✅
`npm audit fix` dijalankan. **13 kerentanan (2 critical, 9 high, 2 moderate) →
3 high.** Kedua yang critical (`next-auth` / `@auth/core`) tuntas, begitu pula
`undici`, `postcss`, `ip-address`, `nanoid`, `brace-expansion`, `js-yaml`,
`fast-uri`.

Yang berubah **hanya `package-lock.json`** — `package.json` tidak tersentuh, jadi
semuanya kenaikan dependency transitif di dalam rentang versi yang sudah
dinyatakan. Ini hasil teraman yang mungkin; tidak ada API yang berubah.

**Sisa 3 (high):** `next` dan `sharp`, keduanya menuntut `next@16.3.1` yang di
luar rentang saat ini. **Sengaja tidak dikerjakan di sini** — kenaikan versi mayor
Next.js menyentuh routing, build, dan runtime sekaligus, jadi harus jadi
pekerjaan tersendiri yang diuji utuh, bukan menumpang di batch keamanan.

### T-2 — selesai ✅
`web/src/lib/catalog/id-check.ts`: `fetch` sekarang memakai `redirect: "manual"`,
dan respons 3xx dikembalikan sebagai kegagalan dengan pesan yang menyebut
sebabnya (supaya admin yang salah mengisi URL tahu harus memperbaiki apa).

Sekalian ditutup kebocoran sejenis di berkas yang sama: `console.error` pada jalur
gagal dulu mencatat URL **utuh** — dan URL template cek-ID sering memuat API key
sebagai parameter. Sekarang query string dibuang sebelum dicatat, prinsip yang
sama dengan `sanitizeEndpointForLog()`.

> Belum ditutup dan memang di luar cakupan: hostname publik yang DNS-nya mengarah
> ke alamat privat. Itu menuntut resolusi DNS sebelum fetch lalu validasi IP
> hasilnya. Jalur redirect — yang paling gampang dipakai — sudah tertutup.

### T-3 — selesai ✅
`@default(cuid())` **dihapus** dari `Order.publicToken` di schema, dan token
sekarang diisi `generatePublicToken()` (berkas baru
`web/src/lib/order/public-token.ts`, memakai `randomToken(32)` ≈ 190 bit).

Yang membuat perbaikan ini bertahan: tanpa default, **TypeScript menolak setiap
`order.create` yang tidak mengisi kolom ini**. Saat default dihapus, compiler
langsung menunjuk ketiga titik pembuatan order yang ada (dua di
`actions/checkout.ts`, satu di `lib/partner/order.ts`) — tidak ada yang perlu
dicari manual, dan corong keempat di masa depan tidak akan bisa diam-diam kembali
ke pembangkit lemah.

Di `checkout.ts`, token disuntik **di dalam** `createOrderWithRetry` (pemanggil
dilarang mengirimnya lewat `Omit`), jadi kedua jalur checkout terjamin oleh satu
tempat. Pada jalur retry, token dibuat ulang.

**Tidak butuh migrasi:** `@default(cuid())` hanya hidup di level Prisma Client —
kolom di DB tidak pernah punya `DEFAULT` (dikonfirmasi di
`20260730220613_fase7c_public_token_rate_limit/migration.sql`). Token lama tetap
berlaku; tidak ada data yang perlu disentuh.
