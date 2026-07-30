# Fase 7c: Hardening Keamanan — Spec Desain

Status: disetujui Wildan 2026-07-30, siap masuk `superpowers:writing-plans`.

## 0. Konteks

Setelah Fase 7b (alert saldo provider) merge ke `main` (commit `65090a3`), Wildan minta audit keamanan menyeluruh atas `web/src` sebelum menentukan scope hardening — bukan langsung asumsi cuma backlog IDOR lama yang sudah diketahui. Audit dijalankan via subagent (opus) atas seluruh `web/src` (93 file TS/TSX), hasil lengkap dikomit di `docs/superpowers/specs/2026-07-30-fase-7c-security-hardening-audit.md`: **2 Critical, 4 High, 9 Medium, 6 Low**.

**Keputusan scope (final, dari sesi audit):** Fase 7c = SEMUA 2 Critical + 4 High. 9 Medium + 6 Low jadi backlog Fase 7d, tidak disentuh di sini.

**2 pendekatan yang tadinya open question**, didelegasikan Wildan ke asisten sebagai keputusan profesional ("yang paling enak dipakai user" + "aman jangka panjang, bukan scope tersingkat") — keputusan final ada di §3.

## 1. Tujuan & Definisi Selesai

**Tujuan:** menutup seluruh gap keamanan Critical/High yang bisa menyebabkan kerugian uang nyata (settlement asli terblokir, SN/voucher dicuri lewat tebak nomor order, bypass kill-switch provider, sesi admin bocor bertahan lama) atau melumpuhkan layanan (storage exhaustion, brute-force tanpa batas).

**Definisi selesai:** keenam fix (C-1, C-2, H-1, H-2, H-3, H-4) diimplementasikan, seluruh test existing + test baru hijau, verifikasi manual tiap fix (khususnya C-1/C-2/H-1 yang punya skenario attack konkret) dijalankan sebelum merge.

## 2. Scope

### Masuk

1. **C-1 + H-2** — reorder verifikasi signature webhook Midtrans, batasi ukuran body, whitelist header tersimpan (satu perubahan, satu file).
2. **C-2** — kolom `Order.publicToken`, invoice + status API pindah kunci akses dari `orderNumber` ke token.
3. **H-1** — rate limiting berbasis tabel `RateLimit`, dipasang di `proxy.ts` + Server Action rawan.
4. **H-3** — `getAdapter` + `selectFulfillmentSku` + `isItemPurchasable` menghormati `ProviderConfig.isActive`.
5. **H-4** — `session.maxAge` dipersingkat + revalidasi role/`updatedAt` fresh dari DB di semua titik otorisasi ADMIN.

### Sengaja di luar scope

- **9 Medium + 6 Low** dari audit (security header, QR pihak ketiga, verifikasi nominal webhook, dst) — backlog Fase 7d, daftar lengkap ada di dokumen audit §MEDIUM/§LOW.
- **Laporan/analytics admin** dan **deploy Hostinger** — tetap di luar scope, dibahas terpisah (lihat `PROGRESS.md` §12 roadmap).
- **Provider selain Digiflazz** — desain H-3 sudah adapter-agnostic (filter by `ProviderConfig.key`), otomatis berlaku begitu provider lain aktif nanti tanpa perubahan tambahan.

## 3. Keputusan pendekatan (didelegasikan ke asisten)

### C-2: kolom `publicToken` terpisah (bukan ganti `generateOrderNumber`)

**Alasan:** UX publik terbaik = pola Stripe/Shopify — nomor pendek (`INV-20260730-4821`) tetap jadi referensi manusia (dipakai saat hubungi CS, muncul di struk), sementara akses aktual (link invoice, status API) pakai token panjang tak tertebak. Opsi B (ganti `generateOrderNumber` jadi token panjang) tidak punya keuntungan apa pun dibanding ini — cuma bikin nomor order jelek di semua tempat tanpa migrasi kolom baru, padahal migrasinya sendiri kecil dan aman (`@default(cuid())` mengisi otomatis baris lama).

### H-1: tabel MySQL `RateLimit` (bukan in-memory)

**Alasan:** ini aplikasi uang — in-memory Map hilang tiap kali proses Node restart (crash, deploy, PM2 respawn di shared hosting Hostinger), jadi penyerang bisa "reset" limiter cuma dengan memicu/menunggu restart. Effort tambahan kecil karena polanya sama dengan `Job`/`WebhookEvent` yang sudah ada di codebase ini (claim-style atomic update via `updateMany` conditional).

## 4. Desain per fix

### 4.1 C-1 + H-2 — Reorder verifikasi signature webhook Midtrans

**File:** `web/src/app/api/webhooks/midtrans/route.ts`

Urutan baru di `POST()`:
1. Baca `rawBody`. Tolak `413` kalau `rawBody.length > 16_000` — **sebelum** `JSON.parse`, jadi attacker tidak bisa membanjiri apa pun (valid maupun tidak).
2. Parse + validasi Zod (`notifSchema`) — tetap seperti sekarang, `400` kalau gagal.
3. **Verifikasi signature (`verifyMidtransSignature`) di sini, PALING AWAL, sebelum menyentuh `WebhookEvent` sama sekali.** Signature invalid → langsung `403`, tidak ada insert/update row apa pun.
4. Baru setelah signature valid: dedup check `WebhookEvent` by `eventKey`, insert kalau belum ada (race P2002 tetap ditangani sama seperti sekarang), lanjut ke `handleOrderWebhook`/`handleDepositWebhook`, `markProcessed`.
5. Header yang disimpan ke `WebhookEvent.headers` dibatasi whitelist kecil (`content-type`, `x-forwarded-for`, `user-agent`) alih-alih `Object.fromEntries(request.headers)` mentah.

`handleOrderWebhook`/`handleDepositWebhook` internal tidak berubah — murni reorder di `POST()`.

**Efek:** attacker dengan signature palsu tidak bisa lagi "mengunci" `eventKey` sebelum settlement asli datang (menutup C-1), dan tidak bisa lagi menulis row `WebhookEvent` sama sekali kalau signature-nya salah (menutup H-2, storage exhaustion). Body besar ditolak sebelum parsing (defense tambahan H-2).

### 4.2 C-2 — `publicToken` + reroute invoice/status API

**Migrasi Prisma (additive):**
```prisma
model Order {
  // ...field existing tidak berubah...
  orderNumber String @unique // INV-YYYYMMDD-XXXX — tetap, murni referensi tampilan
  publicToken String @unique @default(cuid()) // kunci akses invoice/status
  // ...
  @@index([publicToken])
}
```
`@default(cuid())` mengisi baris lama otomatis saat `prisma migrate deploy` — tidak perlu script backfill manual.

**Perubahan alur:**
- `generateOrderNumber` (`lib/order/order-number.ts`) **tidak berubah**.
- Route pindah: `app/invoice/[orderNumber]/page.tsx` → `app/invoice/[token]/page.tsx`; `app/api/orders/[orderNumber]/status/route.ts` → `app/api/orders/[token]/status/route.ts`. Lookup keduanya pakai `db.order.findUnique({ where: { publicToken: token } })`.
- Semua tempat yang generate link invoice (checkout redirect setelah `createOrder`, dan tempat lain yang perlu digrep saat implementasi — cari referensi `orderNumber` di path/URL) ganti pakai `order.publicToken`.
- Halaman invoice tetap **menampilkan** `orderNumber` sebagai teks (mis. "Order #INV-20260730-4821") untuk referensi customer service — murni display, tidak dipakai untuk query.
- Tambah `export const dynamic = "force-dynamic"` di halaman invoice (menutup risiko caching yang dicatat di audit) + `Cache-Control: no-store` di status API (menutup L-6 sekalian, satu titik kode yang sama).
- Token tidak ditemukan → 404 yang sama (indistinguishable dari "ada tapi bukan milikmu" — tidak relevan di sini karena invoice memang publik-tapi-token-gated, bukan per-user auth), pola konsisten dengan deposit status Fase 4.

### 4.3 H-1 — Rate limiting via tabel `RateLimit`

**Migrasi Prisma:**
```prisma
model RateLimit {
  id          String   @id @default(cuid())
  key         String   @unique // contoh: "login:ip:1.2.3.4:<windowStartMs>"
  windowStart DateTime
  count       Int      @default(1)

  @@index([windowStart])
}
```
Fixed-window algorithm (bukan sliding/token-bucket) — cukup untuk skala trafik Hostinger single-instance, jauh lebih simpel diverifikasi benar. Over-engineering kalau pakai sliding/token-bucket di sini.

**Fungsi inti `checkRateLimit(key, limit, windowMs)`** di `web/src/lib/rate-limit.ts`:
1. Hitung `windowStart` = pembulatan waktu sekarang ke bawah kelipatan `windowMs`.
2. Coba `create` row baru untuk key gabungan `` `${key}:${windowStart.getTime()}` `` dengan `count: 1`. Kalau kena unique-constraint (P2002, race — pola sama dedup webhook) → `updateMany({ where: { key: fullKey, count: { lt: limit } }, data: { count: { increment: 1 } } })`. `updateMany.count === 0` → limit tercapai, tolak.
3. Return `{ allowed: boolean, retryAfterMs?: number }`.

**Titik pemasangan:**
- `proxy.ts` matcher diperluas ke `/api/:path*`, `/login`, `/register` (selain `/admin`, `/account` existing). Proxy jalan di proses Node yang sama dengan app (bukan Vercel Edge — dikonfirmasi via riset deploy Hostinger), jadi akses Prisma langsung dari `proxy.ts` aman.
- Key = `` `${endpoint}:ip:${ip}` ``, IP dari header `x-forwarded-for` (Hostinger di belakang reverse proxy) dengan fallback kalau kosong.
- Limit per endpoint (dari rekomendasi audit): login 5/menit/IP + 20/jam/email (key kedua `login:email:${email}`, dicek langsung di dalam `actions/auth.ts` karena email cuma ada di body POST), register 3/menit/IP, checkout guest 3/menit/IP, webhook 60/menit/IP, cron tick 10/menit/IP, status API baru (`api/orders/[token]/status`) 30/menit/IP.
- Response saat kena limit: `429` + header `Retry-After`.
- Server Actions (checkout, deposit, auth) yang tidak natural lewat proxy matcher (POST ke halaman yang sama, bukan route API terpisah) — panggil `checkRateLimit` langsung di awal action itu sendiri.

**Cleanup:** job self-reschedule baru `cleanup-rate-limits` (pola sama `check-provider-balance`), jalan tiap 1 jam, hapus baris `windowStart` lebih tua dari 2 jam.

### 4.4 H-3 — Kill-switch provider dihormati

**`web/src/lib/providers/registry.ts`** — di `getAdapter`, sebelum `switch`:
```ts
if (!config.isActive) throw new Error(`Provider ${key} sedang dinonaktifkan.`);
```
Ini backstop terakhir (mencegah panggilan API provider sungguhan), tapi diblokir juga lebih awal di checkout supaya order tidak terlanjur dibuat & dibayar sebelum akhirnya gagal:

- `selectFulfillmentSku` (`lib/order/select-provider.ts`) dan `isItemPurchasable` (`lib/catalog/public.ts`) — keduanya pure function, tambah parameter `activeProviders: Set<ProviderKey>`. Filter tambahan: `s.status === "ACTIVE" && activeProviders.has(s.provider)`. `selectFulfillmentSku` dapat reason baru `"provider_inactive"` di return type kalau semua kandidat tersaring karena ini.
- Call site yang query `providerSkus` (`fulfillment.ts:116`, `checkout.ts:65`, `catalog/public.ts` di `getProductForCheckout`) tambah query `db.providerConfig.findMany({ where: { isActive: true }, select: { key: true } })`, jadikan `Set`, teruskan ke fungsi pure di atas.

**Efek:** item dari provider nonaktif langsung tampil "tidak tersedia" di katalog (bukan baru gagal pas checkout), `selectFulfillmentSku` menolak lebih awal di jalur checkout/fulfillment, dan `getAdapter` jadi backstop kalau ada jalur lain yang terlewat.

### 4.5 H-4 — Sesi admin: expiry lebih pendek + revalidasi wajib

Tidak pakai migrasi `sessionVersion` seperti opsi audit — `User.updatedAt` **sudah ada** di schema (`@updatedAt`, auto-bump di SETIAP perubahan field `User`, termasuk `role` dan `passwordHash`), jadi dipakai langsung sebagai "session version" gratis, **tanpa migrasi apa pun**.

1. **`auth.config.ts`**: `session.maxAge` dipersingkat ke 8 jam (`28800`) — defense-in-depth kalau revalidasi di poin 4 somehow terlewat.
2. **`auth.ts`** — `authorize()` ikut kembalikan `updatedAt: user.updatedAt.getTime()` selain `id/email/name/role`.
3. **`auth.config.ts`** — callback `jwt`/`session` meneruskan `updatedAt` apa adanya ke token lalu ke `session.user.updatedAt` (pola sama seperti `role` yang sudah ada). `src/types/next-auth.d.ts` ditambah field ini di augmentation `Session.user`/`JWT`.
4. **Titik revalidasi wajib** — 3× `requireAdmin()` (`catalog.ts`, `orders.ts`, `providers.ts` — **sengaja tetap 3 salinan terpisah**, ada komentar eksplisit di kode kenapa tidak dikonsolidasi; ubah isinya identik di ketiga tempat, bukan digabung jadi satu helper) + guard `/admin` di `proxy.ts`. Setelah cek `session.user.role === "ADMIN"`, fetch `db.user.findUnique({ where: { id }, select: { role: true, updatedAt: true } })`. Tolak (redirect `/login` di proxy, `{ error: "Tidak diizinkan" }` di `requireAdmin`) kalau `fresh.role !== "ADMIN"` **atau** `fresh.updatedAt.getTime() !== session.user.updatedAt`.

**Efek:** begitu admin di-demote atau passwordnya diganti (mis. karena bocor), `updatedAt` di DB berubah, cocokkan gagal di request berikutnya → sesi lama otomatis mati. `/account` (member biasa) sengaja **tidak** disentuh — cuma cek "sudah login atau belum", tidak ada isu privilege escalation di situ, di luar scope H-4.

## 5. Migrasi Prisma (ringkasan)

Dua migrasi additive, tidak saling bergantung, bisa satu migration file atau dua:
1. `Order.publicToken String @unique @default(cuid())` + index (§4.2).
2. `RateLimit` model baru (§4.3).

H-3, H-4, C-1, H-2 **tidak butuh migrasi sama sekali**.

## 6. Error Handling & Edge Case Lintas Fix

- Race condition di `RateLimit` dan dedup `WebhookEvent` ditangani pola yang sama: P2002 dari `create` → refetch/`updateMany` conditional, konsisten dengan pola existing di repo.
- `checkRateLimit` gagal karena DB down (bukan karena limit) — **fail-open** (izinkan request lanjut, log error), bukan fail-closed. Alasan: rate limiter mati total kalau DB down bukan pilihan yang lebih baik daripada limiter longgar sesaat; DB down juga berarti checkout/login dkk sudah pasti gagal duluan di titik lain.
- `proxy.ts` sekarang melakukan query DB (rate limit check §4.3 + revalidasi admin §4.5) — kedua query independen, tidak saling block; kalau salah satu gagal karena DB down, ikuti aturan fail-open yang sama (jangan sampai `proxy.ts` yang error malah mengunci seluruh app).

## 7. Testing

- **Pure function baru/berubah** — TDD penuh, konsisten konvensi repo: `selectFulfillmentSku` (kasus baru: provider nonaktif → `provider_inactive`), `isItemPurchasable` (kasus baru: provider nonaktif → `false`), `checkRateLimit` (di bawah limit → allow, tepat di limit → allow, lewat limit → deny + `retryAfterMs`, window baru → reset).
- **Job/route/Server Action orchestration** — tidak ada test otomatis, konsisten konvensi repo (semua job handler & webhook route lain juga begitu).
- **Verifikasi manual sebelum final review** (wajib, karena ini security fix dengan skenario attack konkret):
  - C-1/H-2: kirim POST ke webhook dengan `order_id` order asli + signature salah → pastikan `WebhookEvent` TIDAK tercatat, lalu kirim settlement asli (Digiflazz/Midtrans sandbox) → pastikan tetap diproses normal.
  - C-2: akses `/invoice/[orderNumber-lama]` (path lama) → pastikan 404 (route sudah pindah), akses `/invoice/[publicToken]` → tampil normal, coba tebak token acak → 404.
  - H-1: spam login salah 6× dalam 1 menit dari IP yang sama → percobaan ke-6 kena `429`.
  - H-3: nonaktifkan provider Digiflazz di `/admin/providers` → item produk terkait langsung "tidak tersedia" di katalog publik, coba checkout langsung (kalau bisa bypass UI) → ditolak di server action.
  - H-4: login admin, ubah role user itu jadi USER langsung di DB (atau lewat admin lain), coba akses `/admin` dengan sesi lama → ter-redirect ke `/login`.
