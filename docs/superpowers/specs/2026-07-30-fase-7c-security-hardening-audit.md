# Fase 7c — Audit Keamanan Menyeluruh (bahan brainstorming, BUKAN spec final)

Status: brainstorming Fase 7c SEDANG BERJALAN, dijeda sebelum desain final ditulis. Dokumen ini adalah hasil riset audit yang sudah disetujui scope-nya oleh user, dipakai sebagai bahan untuk `superpowers:writing-plans` setelah 2 pertanyaan pendekatan di bawah dijawab.

## Konteks

Setelah Fase 7b (alert saldo provider) merge ke `main` (commit `65090a3`), user memilih lanjut ke Fase 7c dengan fokus **hardening keamanan** (dari 3 opsi sisa scope Fase 7: laporan / hardening / deploy Hostinger — lihat `PROGRESS.md` §12 roadmap). User minta audit keamanan menyeluruh dulu sebelum menentukan scope pasti (bukan langsung asumsi cuma 2 item backlog yang sudah diketahui).

Audit dijalankan via subagent (opus, general-purpose) atas seluruh `web/src` (93 file TS/TSX, 6 API route, 6 file server actions, 12 halaman, 20 file `lib/`). Aplikasi Laravel di root TIDAK disentuh/diaudit (legacy, tidak relevan).

## Ringkasan temuan

**2 Critical, 4 High, 9 Medium, 6 Low.**

**Keputusan user: scope Fase 7c = SEMUA 2 Critical + 4 High.** 9 Medium + 6 Low jadi backlog Fase 7d/nanti (dicatat lengkap di bawah, tidak dibuang).

---

## CRITICAL

### C-1. Poisoning idempotency webhook Midtrans — settlement asli bisa di-blokir attacker (BARU, belum pernah ke-flag sebelumnya)
**File:** `web/src/app/api/webhooks/midtrans/route.ts:148-182`

Urutan operasi salah: row `WebhookEvent` dibuat dan ditandai `processedAt` **sebelum** signature diverifikasi (baris 179-181 verifikasi signature terjadi SETELAH insert/cek dedup di baris 148-164). Attacker kirim POST dengan `order_id` tebakan (space kecil karena C-2) + signature palsu → dapat 403 tapi `WebhookEvent.eventKey` sudah tercatat `processedAt` terisi → webhook settlement ASLI yang datang belakangan untuk order itu kena "sudah diproses" (dedup) dan diabaikan. Order macet `PENDING_PAYMENT` → job `expire-order` jadikan `EXPIRED`. Uang masuk ke Midtrans, barang tidak terkirim, tanpa refund otomatis (`reconcile-paid-orders` cuma scan status `PAID`, tidak menolong kasus ini). Tanpa rate limit (H-1), attacker bisa meracuni SELURUH ruang nomor order sehari dalam hitungan menit.

**Fix yang disarankan:** verifikasi signature PALING AWAL, sebelum menyentuh DB sama sekali. Request signature-invalid: langsung 403 tanpa insert/update `WebhookEvent` (kalau perlu audit trail, tabel/kolom terpisah yang tidak memakai `eventKey` unik yang sama dengan jalur valid).

### C-2. IDOR di `/invoice/[orderNumber]` + `/api/orders/[orderNumber]/status` (sudah diketahui sejak Fase 3/4, terkonfirmasi masih ada)
**File:**
- `web/src/app/api/orders/[orderNumber]/status/route.ts:4-28` (tidak ada `auth()`)
- `web/src/app/invoice/[orderNumber]/page.tsx:11-16` (tidak ada `auth()`)
- `web/src/lib/order/order-number.ts:5` (`Math.floor(random() * 10000)` — cuma 4 digit/hari)

Data yang bocor ke siapa pun yang menebak `orderNumber`: `productName`, `itemName`, `total`, `qrString`, `expiredAt`, dan **`sn`** (kode voucher/SN — bernilai uang langsung, bisa ditebus orang lain sebelum pemilik order buka invoice-nya).

**Catatan tambahan yang memperparah:** `/invoice/[orderNumber]` tidak punya `dynamic = "force-dynamic"` sama sekali di codebase (grep: nol hasil) — berisiko ke-cache dan dilayani ke siapa pun; `/api/orders/.../status` juga tanpa `Cache-Control: no-store`.

**2 pendekatan fix, BELUM DIPUTUSKAN user (lihat "Pertanyaan terbuka" di bawah):**
- (a) Tambah kolom `publicToken` terpisah (nanoid/cuid panjang) khusus akses invoice/status, `orderNumber` tetap format display 4 digit apa adanya. Butuh migrasi Prisma kecil (pola sama Fase 7a `manualSn`).
- (b) Ganti `generateOrderNumber` langsung jadi token kriptografis panjang (tanpa kolom baru, tapi format order number user-facing jadi lebih panjang/kurang rapi, order lama tetap pendek sampai kadaluarsa).

---

## HIGH

### H-1. Tidak ada rate limiting sama sekali di seluruh aplikasi
**File:** semua endpoint publik — login/register (`actions/auth.ts`), checkout (`actions/checkout.ts:37`), deposit (`actions/deposit.ts:15`), webhook (`api/webhooks/midtrans/route.ts:130`), cron tick (`api/cron/tick/route.ts:6`), status API (`api/orders/[orderNumber]/status/route.ts:4`).

Grep `rate|limit|throttle|Retry-After|x-forwarded-for`: nol hasil. Risiko berlapis: brute-force login tanpa lockout; bcrypt cost-12 jadi vektor CPU-exhaustion DoS murah (~250-400ms CPU/request, shared hosting Hostinger bisa tumbang); guest checkout anonim bisa spam bikin Order+panggil Midtrans sungguhan tanpa batas; memperbesar C-1/C-2 (butuh volume tinggi, jadi murah tanpa limiter); brute-force `CRON_SECRET` tanpa batas percobaan.

**Fix yang disarankan:** limiter di `proxy.ts` (perluas matcher ke `/api/:path*` + `/login` + `/register`), per-IP + per-endpoint. Prioritas: login 5/menit/IP + 20/jam/email, register 3/menit/IP, checkout guest 3/menit/IP, webhook 60/menit/IP, cron tick 10/menit/IP.

**Pendekatan storage, BELUM DIPUTUSKAN user (lihat "Pertanyaan terbuka"):** in-memory Map/LRU per proses (simpel, cukup untuk 1 instance persistent Node — sesuai riset Hostinger Business Web App, lihat `project_hostinger_deploy_research` memory) VS tabel MySQL `RateLimit` (persisten lintas restart, tapi nambah write load + perlu migrasi + job cleanup).

### H-2. `WebhookEvent` bisa ditulis siapa pun tanpa autentikasi — storage exhaustion
**File:** `web/src/app/api/webhooks/midtrans/route.ts:154-164`

Insert row (termasuk `rawBody` mentah + SEMUA header request, `Object.fromEntries(request.headers)`) terjadi sebelum signature dicek. Attacker kirim POST ber-`order_id` acak unik → row baru selamanya, bisa mengisi disk MySQL shared-hosting. Fix-nya SAMA dengan C-1 (reorder verifikasi signature ke paling awal) + batasi ukuran body (>16KB tolak) + whitelist header yang disimpan.

### H-3. Kill-switch provider tidak berfungsi — `getAdapter()` mengabaikan `ProviderConfig.isActive`
**File:** `web/src/lib/providers/registry.ts:15-26`; jalur terdampak `lib/order/fulfillment.ts:157,315`, `lib/order/select-provider.ts:11`, `lib/catalog/public.ts:7`.

Tombol "Nonaktifkan" di `/admin/providers` TIDAK menghentikan transaksi apa pun — `getAdapter` tidak cek `config.isActive`, `selectFulfillmentSku`/`isItemPurchasable` cuma cek `ProviderSku.status`. Skenario nyata: admin nonaktifkan provider karena API key bocor/saldo habis, yakin aman karena badge UI bilang "Nonaktif", tapi order baru tetap diproses & saldo provider tetap terdebit. Efek nyata satu-satunya dari `isActive:false` cuma job `check-provider-balance` berhenti memantau — alert saldo mati justru saat paling dibutuhkan.

**Fix yang disarankan:** `if (!config.isActive) throw new Error(...)` di `getAdapter`, + filter `providerConfig.isActive` di `selectFulfillmentSku`/`isItemPurchasable` supaya item juga tidak bisa di-checkout. Straightforward, tidak ada trade-off/pendekatan alternatif yang perlu diputuskan user.

### H-4. Sesi JWT tanpa masa berlaku eksplisit dan tanpa revalidasi role dari DB
**File:** `web/src/lib/auth.config.ts:5-22`; efek di `proxy.ts:11`, `admin/layout.tsx:18`, 3× `requireAdmin()`.

`role` dibekukan ke JWT saat sign-in, default next-auth maxAge 30 hari, tidak pernah dicek ulang ke DB. Admin yang di-demote atau password-nya diganti karena bocor tetap punya akses penuh sampai 30 hari (cookie lama masih sah) — bisa menimpa kredensial provider, refund manual, dll.

**Fix yang disarankan:** `session.maxAge` dipersingkat (mis. 8 jam) + `User.sessionVersion` (increment saat ganti password/role, migrasi kecil) dibandingkan di callback `jwt`, ATAU minimal ambil `role` fresh dari DB di setiap `requireAdmin()`/middleware alih-alih percaya token. Belum ada pertanyaan terbuka spesifik ke user soal ini — bisa dibahas saat writing-plans (trade-off performa DB-lookup-tiap-request vs sessionVersion).

---

## MEDIUM (backlog Fase 7d, TIDAK masuk scope Fase 7c)

- **M-1** Tidak ada security header sama sekali (CSP, X-Frame-Options, HSTS, dll) — `next.config.ts` kosong.
- **M-2** QR payload QRIS dikirim ke pihak ketiga `api.qrserver.com` (data transaksi bocor ke pihak luar + dependency eksternal).
- **M-3** Settlement webhook diterima tanpa verifikasi nominal (`grossAmount`) cocok dengan `order.total`/`deposit.amount`.
- **M-4** `target` checkout (`z.record`) tidak dibatasi jumlah field/panjang nilai — bisa dibengkakkan jadi row raksasa.
- **M-5** Enumerasi email terdaftar di registrasi (pesan beda utk email sudah ada vs belum, tanpa rate limit).
- **M-6** Re-run `prisma db seed` bisa mempromosikan akun attacker jadi ADMIN kalau attacker daftar pakai email = `ADMIN_EMAIL` duluan.
- **M-7** 3 halaman `/account/*` tidak cek sesi sendiri (`session!` non-null assertion) — kalau `proxy.ts` suatu saat lolos/token id `undefined`, `where: { userId: undefined }` di Prisma bisa balikin SEMUA data user.
- **M-8** Pesan error provider mentah (termasuk Prisma) dikembalikan ke UI admin (bukan endpoint publik).
- **M-9** `orderNumber`/`refId` pakai `Math.random()` (non-kriptografis) — terkait C-2 tapi bug terpisah (juga dipakai untuk `refId` idempotency ke Digiflazz).

## LOW (backlog Fase 7d)

- **L-1** `CRON_SECRET` compare `!==` bukan `timingSafeEqual` (sudah diketahui sejak Fase 2, masih ada).
- **L-2** Signature webhook Midtrans (`lib/midtrans/signature.ts:17`) benar secara algoritma tapi compare non-constant-time (`===`). Pola yang benar sudah ada di `digiflazz-sign.ts` di repo yang sama, tinggal ditiru.
- **L-3** Seluruh header request webhook disimpan permanen ke DB (termasuk potensi `cookie`/`authorization` kalau ada).
- **L-4** SN/voucher tersimpan plaintext di DB + berpotensi ke-log lewat `e.message` adapter.
- **L-5** `sendTelegramAlert` log isi pesan (termasuk saldo provider) ke console saat config kosong.
- **L-6** Tidak ada `Cache-Control: no-store` di API route yang mengembalikan data transaksi.

## Yang sudah BENAR (diverifikasi, tidak perlu disentuh Fase 7c)

- Injection: bersih total (grep `$queryRaw`/`exec`/`eval`/`dangerouslySetInnerHTML` dll: nol hasil).
- Enkripsi kredensial provider: AES-256-GCM benar, IV acak per operasi, authTag diverifikasi, tidak ada fallback key lemah.
- Signature webhook Digiflazz: sudah timing-safe (`digiflazz-sign.ts`).
- Password hashing: bcrypt cost 12 benar, email dinormalisasi, pesan login generik, JWT tidak leak data sensitif.
- CSRF: posture memadai (Server Actions punya origin-check bawaan Next.js, API route state-changing cuma webhook+cron yang non-cookie-auth).
- Admin routes: terjaga 2 lapis (middleware + layout), semua 13 server action admin panggil `requireAdmin()` di awal.
- Mass assignment: tidak ada, semua field ditulis eksplisit via Zod, harga selalu dari DB bukan input client.
- Money-safety fulfillment: klaim atomik, `WalletLedger.idempotencyKey` unique, guard status anti-double-payout — semua solid (warisan Fase 7a).
- Secret handling: `.env` tidak ter-track git, dikonfirmasi via `git check-ignore`.
- Next.js 16.2.10 sudah di atas patch CVE-2025-29927 (middleware bypass).

## Prioritas perbaikan (rekomendasi audit, urutan effort vs dampak)

| # | Temuan | Severity | Effort |
|---|--------|----------|--------|
| 1 | C-1 reorder verifikasi signature webhook (sekaligus tutup H-2) | Critical | Kecil |
| 2 | C-2 orderNumber acak kriptografis + authz/token invoice & status API | Critical | Sedang (butuh migrasi) |
| 3 | H-3 `getAdapter` hormati `isActive` | High | Kecil |
| 4 | H-1 Rate limiting di `proxy.ts` | High | Sedang |
| 5 | H-4 `session.maxAge` + revalidasi role | High | Kecil-Sedang |

## Pertanyaan terbuka — BELUM DIJAWAB user, jawab ini dulu sebelum lanjut ke `writing-plans`

1. **C-2 pendekatan:** kolom `publicToken` terpisah (migrasi kecil, `orderNumber` display tidak berubah) **[direkomendasikan]** VS ganti `generateOrderNumber` langsung jadi token panjang (tanpa migrasi, tapi format order number user-facing berubah).
2. **H-1 storage rate limit:** in-memory per proses **[direkomendasikan, cukup untuk 1 instance Hostinger]** VS tabel MySQL `RateLimit` (persisten, lebih berat).

Setelah 2 pertanyaan ini dijawab, lanjut proses brainstorming normal: presentasikan desain per bagian (arsitektur, tiap 6 fix C-1/C-2/H-1/H-2/H-3/H-4), tulis spec final ke `docs/superpowers/specs/2026-07-30-fase-7c-security-hardening-design.md` (nama file BEDA dari dokumen ini — dokumen ini cuma audit mentah), lalu `superpowers:writing-plans`.
