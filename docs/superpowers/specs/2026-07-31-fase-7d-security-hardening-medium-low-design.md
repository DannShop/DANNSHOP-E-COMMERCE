# Fase 7d: Hardening Keamanan (Medium + Low) — Spec Desain

Status: disetujui Wildan 2026-07-31, siap masuk `superpowers:writing-plans`.

## 0. Konteks

Fase 7c (2 Critical + 4 High dari audit keamanan) selesai dan merge ke `main` (commit `a38e609`). Audit yang sama (`docs/superpowers/specs/2026-07-30-fase-7c-security-hardening-audit.md`) juga menemukan **9 Medium + 6 Low** yang sengaja dibiarkan sebagai backlog Fase 7d. Wildan minta lanjut menutup seluruh backlog itu (semua 15 item, tidak ada yang di-skip), dan mendelegasikan keputusan pendekatan teknis ke asisten selaku "profesional" — 2 keputusan konkret ada di §3.

**Temuan riset tambahan sebelum desain ini ditulis** (memengaruhi scope, mengurangi kerjaan):
- **L-3** (semua header webhook disimpan mentah termasuk potensi `cookie`/`authorization`) — **sudah tertutup total** sebagai efek samping Fase 7c Task 2 (`ALLOWED_HEADER_KEYS` whitelist di `web/src/app/api/webhooks/midtrans/route.ts`). Tidak ada kerjaan baru, cuma perlu diverifikasi ulang di final review Fase 7d supaya tidak dianggap regresi kalau ada yang menyentuh file itu lagi.
- **L-6** (`Cache-Control: no-store` di API transaksi) — **sudah sebagian** (`/api/orders/[token]/status`, dari Fase 7c Task 5). Masih perlu ditambah di `/api/deposits/[depositId]/status` dan `/api/admin/provider-price-list`.

## 1. Tujuan & Definisi Selesai

**Tujuan:** menutup seluruh 9 Medium + 6 Low findings dari audit Fase 7c — kelas masalah di sini adalah defense-in-depth, information hygiene, dan hardening tambahan (bukan Critical/High yang punya jalur eksploitasi langsung ke kerugian uang), tapi tetap nyata (mis. race admin-promotion, enumerasi email, security header nihil).

**Definisi selesai:** seluruh 15 item diimplementasikan (2 di antaranya — L-3, sebagian L-6 — sudah/nyaris selesai, tinggal diverifikasi/dilengkapi), test existing + test baru hijau, `tsc`/lint bersih, verifikasi manual untuk item yang punya efek yang bisa dicek langsung (CSP header, QR ter-render tanpa network eksternal, pesan registrasi generik, dst) sebelum merge.

## 2. Scope

### Masuk (semua 15, dikelompokkan jadi 4 task per subsistem — lihat §7 untuk alasan pengelompokan)

**Kelompok A — QR self-generate + Security Header**
1. **M-2** — QR code QRIS di-generate sendiri di server, hapus dependency `api.qrserver.com`.
2. **M-1** — Security header (CSP, X-Frame-Options, HSTS, dll) di `next.config.ts`.

**Kelompok B — Webhook/money-safety hardening**
3. **M-3** — Verifikasi nominal (`grossAmount`) settlement webhook cocok `order.total`/`deposit.amount`.
4. **L-2** — Compare signature webhook Midtrans jadi timing-safe.
5. **L-4** — SN/voucher tidak boleh ke-log lewat `e.message` adapter (DB tetap plaintext, lihat §4.2.3).

**Kelompok C — Auth/akun hardening**
6. **M-5** — Pesan registrasi generik (tidak bedakan email sudah terdaftar vs belum).
7. **M-6** — Seed tidak pernah promote/update user yang sudah ada (fix keputusan §3) + registrasi menolak email = `ADMIN_EMAIL`.
8. **M-7** — Hapus `session!` non-null assertion di 3 halaman `/account/*`.
9. **L-1** — Compare `CRON_SECRET` jadi timing-safe.

**Kelompok D — Input/output hygiene**
10. **M-4** — Batasi jumlah field + panjang value di `target` checkout.
11. **M-8** — Pesan error provider/Prisma mentah diganti generik di 4 lokasi UI admin.
12. **M-9** — `orderNumber`/`refId` pakai `crypto.randomInt` (bukan `Math.random()`).
13. **L-5** — `sendTelegramAlert` tidak log isi pesan mentah saat config kosong.
14. **L-6 (sisa)** — Tambah `Cache-Control: no-store` di 2 route yang belum.

**Verifikasi-saja (tidak ada kerjaan baru)**
15. **L-3** — konfirmasi ulang whitelist header webhook masih berlaku, catat di laporan final review.

### Sengaja di luar scope

- Provider selain Digiflazz, laporan/analytics admin, deploy Hostinger — tetap di luar scope (lihat `PROGRESS.md` §12 roadmap).
- Enkripsi SN/voucher di database (dipertimbangkan untuk L-4, ditolak — lihat §4.2.3 untuk alasan).
- Verifikasi email saat registrasi (di luar scope M-5 — M-5 cuma soal pesan generik, bukan menambah alur verifikasi email baru).

## 3. Keputusan pendekatan (didelegasikan ke asisten)

### M-2: generate QR sendiri di server (bukan pindah ke pihak ketiga lain)

**Alasan:** satu-satunya cara benar-benar menghilangkan kebocoran data transaksi (`qrString`) ke pihak luar. Library `qrcode` (npm) generate PNG/data-URI langsung dari string yang sudah ada di server, tanpa network call apa pun. Efek samping bagus: menyederhanakan CSP (§3, M-1) karena tidak ada lagi domain gambar eksternal yang perlu di-whitelist.

### M-6: seed tidak pernah update role user yang sudah ada

**Alasan:** cara paling langsung menutup celah — begitu email itu sudah ada di DB (siapa pun pembuatnya), seed tidak pernah menyentuh `role` lagi. Promosi admin jadi murni aksi manual DB (sudah jadi kebiasaan operasional proyek ini sejak awal, lihat `ADMIN_EMAIL`/`ADMIN_PASSWORD` di `.env` cuma dipakai sekali saat `create`). Opsi alternatif (cek `passwordHash` cocok sebelum promote) tidak menutup akar masalah — attacker yang daftar duluan otomatis pemegang password itu, jadi perlindungan itu bukan perlindungan nyata.

## 4. Desain per kelompok

### 4.1 Kelompok A — QR self-generate + Security Header

#### 4.1.1 M-2 — QR self-generate

**File:** `web/src/app/invoice/[token]/page.tsx`, `web/src/app/account/deposit/[depositId]/page.tsx` (atau setara — cek nama file server component saat ini), `web/src/app/invoice/[token]/invoice-status.tsx`, `web/src/app/account/deposit/[depositId]/deposit-status.tsx`.

Tambah dependency `qrcode` (+ `@types/qrcode`). Di server component (yang sudah punya akses `qrString` dari `order.payment.actions`/`deposit`), generate data URI:

```ts
import QRCode from "qrcode";

const qrDataUri = qrString ? await QRCode.toDataURL(qrString, { width: 240, margin: 1 }) : null;
```

Teruskan `qrDataUri` (bukan `qrString` mentah) sebagai prop ke client component (`InvoiceStatus`/`DepositStatus`). Client component ganti `<img src="https://api.qrserver.com/...">` jadi `<img src={qrDataUri}>` langsung — tidak ada network request ke domain luar sama sekali dari browser maupun server saat render (generate PNG murni lokal, library `qrcode` tidak butuh koneksi apa pun).

**Kenapa bukan endpoint API baru** (`/api/qr?data=...`): akan menambah permukaan endpoint publik baru yang perlu dipikirkan rate-limit/auth-nya sendiri, padahal `qrString` sudah tersedia gratis di server component yang sama saat render halaman — tidak ada alasan bikin round-trip tambahan.

**Efek pada polling:** `invoice-status.tsx`/`deposit-status.tsx` polling status tiap 3 detik lewat `useQuery` — response JSON dari `/api/orders/[token]/status` & endpoint deposit yang setara SUDAH mengandung `qrString` (field existing), jadi kalau butuh QR ter-update tanpa reload (jarang terjadi karena QR sama sepanjang window pembayaran), client bisa generate ulang data-URI di browser pakai `qrcode` versi browser-safe (paket yang sama support browser build) — tapi ini TIDAK perlu untuk kasus normal (QR yang sama dipakai sampai expired/paid), jadi cukup generate sekali di server saat initial render, tidak perlu di-regenerate tiap polling tick.

#### 4.1.2 M-1 — Security header

**File:** `web/next.config.ts`

Tambah fungsi `headers()` async yang berlaku untuk semua route:

```ts
async headers() {
  return [
    {
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "font-src 'self'",
            "connect-src 'self'",
            "frame-ancestors 'none'",
          ].join("; "),
        },
      ],
    },
  ];
},
```

Catatan desain per directive:
- `img-src 'self' data:` — `data:` wajib karena M-2 mengganti QR jadi data URI base64. Tidak ada domain eksternal lain (font sudah self-hosted via `next/font/google`, dikonfirmasi tidak ada `fonts.googleapis.com`/`fonts.gstatic.com` di runtime browser).
- `script-src`/`style-src` pakai `'unsafe-inline'` — Next.js App Router masih menyuntik inline script bootstrap (hydration data) dan beberapa inline style; menghilangkan ini butuh nonce-based CSP yang jauh lebih kompleks (perlu middleware generate nonce per-request) untuk manfaat marginal di aplikasi yang sudah bersih dari XSS (dikonfirmasi audit Fase 7c: nol `dangerouslySetInnerHTML`). Di luar scope — YAGNI.
- `connect-src 'self'` — semua `fetch()` client-side (polling status) memang cuma ke API sendiri; `sendTelegramAlert`/panggilan Midtrans/Digiflazz semua terjadi di server (Node), tidak kena CSP browser sama sekali.
- HSTS aman diaktifkan karena Hostinger (target deploy) sudah HTTPS by default — dikonfirmasi di `project_hostinger_deploy_research`.

**Verifikasi:** setelah implementasi, load tiap halaman publik (`/`, produk, invoice, checkout, admin) di browser dan pastikan tidak ada CSP violation di console — kalau ada directive yang kurang longgar (mis. Base UI/shadcn component ternyata butuh sesuatu yang belum di-whitelist), sesuaikan saat itu juga.

### 4.2 Kelompok B — Webhook/money-safety hardening

#### 4.2.1 M-3 — Verifikasi nominal settlement

**File:** `web/src/app/api/webhooks/midtrans/route.ts`, fungsi `handleOrderWebhook`/`handleDepositWebhook`.

Setelah `getTransactionStatus` konfirmasi ulang ke Midtrans dan sebelum klaim atomik `status: "PENDING_PAYMENT" → "PAID"`, tambah pengecekan nominal. `confirmed.grossAmount` dari Midtrans berformat string `"22000.00"`; `order.total`/`deposit.amount` tersimpan `BigInt`. Bandingkan dengan normalisasi:

```ts
const expected = order.total; // BigInt
const received = BigInt(Math.round(Number(confirmed.grossAmount)));
if (received !== expected) {
  console.error("handleOrderWebhook: nominal settlement tidak cocok, escalate", {
    orderId: order.id, expected: expected.toString(), received: received.toString(),
  });
  await escalateOrder({ orderId: order.id, orderNumber: order.orderNumber, toStatus: "NEEDS_REVIEW", note: "Nominal settlement tidak cocok dengan total order" });
  return "amount_mismatch";
}
```

Untuk `handleDepositWebhook`, pola sama tapi target `deposit.amount`, dan pada mismatch JANGAN kredit saldo — log error jelas + biarkan status tetap `PENDING` (bukan auto-`PAID`), supaya admin bisa investigasi manual (tidak ada `NEEDS_REVIEW` equivalent untuk `Deposit`, jadi cukup log + tidak proses, konsisten pola existing `"paid_but_not_pending"`).

**Ini defense-in-depth murni** — tidak ada jalur normal di mana `order.total` bisa salah hitung (harga selalu dari DB, bukan input client, dikonfirmasi audit Fase 7c). Perlindungan ini untuk skenario di luar kendali kita (bug masa depan, API Midtrans dikompromikan) — proporsional untuk Medium, bukan menandakan ada bug aktif sekarang.

#### 4.2.2 L-2 — Timing-safe compare signature Midtrans

**File:** `web/src/lib/midtrans/signature.ts`

Tiru pola `digiflazz-sign.ts` (sudah benar di file itu) persis:

```ts
import { timingSafeEqual } from "node:crypto";

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
```

Ganti `computedSignature === notif.signature_key` (atau nama variabel yang sesuai di file itu) jadi `safeCompare(computedSignature, notif.signature_key)`.

#### 4.2.3 L-4 — SN tidak boleh ke-log

**Keputusan scope (sempit, sesuai audit yang tidak kasih rekomendasi konkret untuk enkripsi):** SN **tetap plaintext** di kolom `OrderFulfillment.sn`/`Order.manualSn` — nilai ini memang harus ditampilkan balik ke customer di invoice, jadi enkripsi-di-rest untuk data yang segera didekripsi lagi tidak menambah keamanan riil, cuma menambah kompleksitas (butuh kunci, titik decrypt baru, risiko decrypt-failure). Fokus fix ke bagian yang benar-benar berisiko: SN ikut nyasar ke `console.error`/log lain lewat `e.message` provider.

**File:** `web/src/lib/order/fulfillment.ts`, `web/src/lib/jobs/runner.ts` — titik-titik yang `console.error` hasil error adapter (`e.message`/`error: e`). Cek isi `DigiflazzAdapter`'s error paths — kalau ada yang menyisipkan payload response provider (yang bisa memuat SN kalau providernya balikin SN bahkan di jalur gagal) ke `Error.message`, redact sebelum log, atau log objek terstruktur yang eksplisit exclude field `sn`/`serial_number` dari payload provider.

### 4.3 Kelompok C — Auth/akun hardening

#### 4.3.1 M-5 — Pesan registrasi generik

**File:** `web/src/app/actions/auth.ts`, `registerAction`.

Ganti percabangan pesan (`"Email sudah terdaftar."` vs sukses) jadi satu pesan yang sama persis di kedua kasus — konstanta `REGISTER_GENERIC_OK` (lihat §4.3.2, dipakai bersama oleh M-5 dan M-6 karena keduanya sama-sama titik return di `registerAction`). Alur: cek `existing` seperti sekarang, tapi kalau `existing` ada, JANGAN buat user baru dan JANGAN kasih tahu itu sebabnya — return `{ ok: REGISTER_GENERIC_OK }` yang sama dengan jalur create-berhasil, redirect ke `/login` di kedua kasus.

#### 4.3.2 M-6 — Seed no-promote + registrasi tolak `ADMIN_EMAIL`

**File:** `web/prisma/seed.ts`

```ts
const existingAdmin = await db.user.findUnique({ where: { email } });
if (!existingAdmin) {
  const passwordHash = await bcrypt.hash(password, 12);
  await db.user.create({ data: { email, passwordHash, name: "Admin DannShop", role: "ADMIN" } });
}
// kalau sudah ada (siapa pun buatnya) - JANGAN sentuh role/passwordHash sama sekali
```

**File:** `web/src/app/actions/auth.ts`, `registerAction` — tambah cek di awal, SEBELUM cek `existing` biasa, dan pakai return type yang SAMA (`ok`, bukan `error`) dengan jalur sukses M-5 supaya tidak jadi oracle baru "email ini ditolak secara khusus":

```ts
const REGISTER_GENERIC_OK = "Kalau email ini belum terdaftar, akun sudah dibuat. Silakan login.";

if (parsed.data.email === process.env.ADMIN_EMAIL?.trim().toLowerCase()) {
  return { ok: REGISTER_GENERIC_OK }; // reserved email - diam-diam tidak dibuat, tapi respons identik dgn sukses/sudah-ada
}
const existing = await db.user.findUnique({ where: { email: parsed.data.email } });
if (!existing) {
  await db.user.create({ /* ...data seperti sekarang... */ });
}
return { ok: REGISTER_GENERIC_OK };
```

Konstanta `REGISTER_GENERIC_OK` dipakai di ketiga jalur (email baru, email sudah ada, email = `ADMIN_EMAIL`) — literal string yang sama persis, bukan cuma "pesan serupa".

#### 4.3.3 M-7 — Hapus `session!` assertion

**File:** `web/src/app/account/page.tsx`, `web/src/app/account/orders/page.tsx`, `web/src/app/account/deposits/page.tsx`.

Pola pengganti (konsisten dengan halaman `/account/deposit/[depositId]` Fase 4 yang sudah benar):

```ts
const session = await auth();
if (!session?.user?.id) redirect("/login");
// lanjut pakai session.user.id (bukan session!.user.id)
```

#### 4.3.4 L-1 — Timing-safe `CRON_SECRET`

**File:** `web/src/app/api/cron/tick/route.ts`

Pola sama persis §4.2.2 (`safeCompare`) — pertimbangkan ekstrak `safeCompare` jadi helper bersama di `web/src/lib/crypto.ts` (sudah ada file ini, isinya `encryptJson`/`decryptJson`) dipakai oleh L-1 dan L-2 sekaligus, daripada duplikasi 2x. **Ekstraksi ini diputuskan saat implementasi** (task reviewer boleh flag kalau duplikasi 2 titik dianggap lebih baik daripada helper baru — bukan keputusan mengikat di sini).

### 4.4 Kelompok D — Input/output hygiene

#### 4.4.1 M-4 — Batasi `target` checkout

**File:** `web/src/lib/validation/checkout.ts`

```ts
target: z.record(z.string(), z.string().min(1, "Wajib diisi").max(255))
  .refine((t) => Object.keys(t).length <= 10, "Terlalu banyak field"),
```

Batas 10 field jauh di atas kebutuhan real (produk existing pakai 1-2 field: `user_id`/`zone_id`/`phone_number`), 255 karakter per value konsisten dengan konvensi VARCHAR(191)-ish yang sudah dipakai di tempat lain repo ini (`truncateNote` dari Fase 7a).

#### 4.4.2 M-8 — Pesan error admin generik

**File:** `web/src/app/actions/providers.ts` (3 lokasi), `web/src/app/api/admin/provider-price-list/route.ts` (1 lokasi).

Pola: `console.error` detail asli (`e instanceof Error ? e.message : e`) server-side, return pesan generik tetap ke client:

```ts
} catch (e) {
  console.error("checkBalance: gagal", { provider: key, error: e });
  return { error: "Gagal cek saldo provider, coba lagi." }; // bukan e.message
}
```

Pesan generik per lokasi disesuaikan konteksnya (cek saldo / transaksi tes / sync harga / price list) — sudah ada fallback string yang tepat di kode existing untuk masing-masing (`"Gagal cek saldo."` dst), tinggal dipakai selalu alih-alih cuma sebagai fallback saat `e` bukan `Error`.

#### 4.4.3 M-9 — `crypto.randomInt` untuk `orderNumber`/`refId`

**File:** `web/src/lib/order/order-number.ts`

`generateOrderNumber`/`generateRefId` menerima parameter random function yang testable (dikonfirmasi dari test existing `generateOrderNumber(now, () => 0.1234)`) — ganti default parameter dari `Math.random` jadi wrapper `crypto.randomInt`:

```ts
import { randomInt } from "node:crypto";

function cryptoRandom(): number {
  return randomInt(0, 1_000_000) / 1_000_000; // [0, 1) — drop-in pengganti Math.random()
}
```

Default parameter di kedua fungsi (`generateOrderNumber(now, rand = cryptoRandom)`, dst) ganti dari `Math.random` ke `cryptoRandom` — signature function tidak berubah sama sekali (masih terima `() => number` di range `[0, 1)`), jadi test existing yang inject `() => 0.1234` tetap valid tanpa perubahan.

#### 4.4.4 L-5 — Redact log Telegram

**File:** `web/src/lib/notify/telegram.ts`

Titik early-return saat config kosong — ganti `console.log(message)` (atau serupa) jadi:

```ts
console.warn("sendTelegramAlert: TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID belum di-set, alert dilewati");
```

Tidak menyertakan isi `message` (yang bisa memuat saldo provider/order detail) di log sama sekali.

#### 4.4.5 L-6 (sisa) — `Cache-Control: no-store`

**File:** `web/src/app/api/deposits/[depositId]/status/route.ts`, `web/src/app/api/admin/provider-price-list/route.ts`.

Tambah `{ headers: { "Cache-Control": "no-store" } }` di `NextResponse.json(...)`, pola identik yang sudah ada di `web/src/app/api/orders/[token]/status/route.ts`.

### 4.5 Verifikasi-saja — L-3

Tidak ada perubahan kode. Task implementasi cukup baca `web/src/app/api/webhooks/midtrans/route.ts`, konfirmasi `ALLOWED_HEADER_KEYS` masih ada dan dipakai di titik insert `WebhookEvent`, catat di laporan task "L-3 sudah tertutup sejak Fase 7c Task 2, diverifikasi ulang di sini, tidak ada perubahan."

## 5. Migrasi Prisma

**Tidak ada migrasi Prisma sama sekali di Fase 7d.** Seluruh 15 item adalah perubahan logic/config, tidak ada perubahan schema.

## 6. Error Handling & Edge Case Lintas Fix

- M-3 (verifikasi nominal) memakai `escalateOrder` yang sudah ada (Fase 7a) — tidak ada helper baru, konsisten pola existing.
- M-2 (QR self-generate) — kalau `QRCode.toDataURL` throw (input `qrString` corrupt/kosong), server component harus tangani dengan fallback (render tanpa QR + pesan "QR tidak tersedia, hubungi CS") bukan crash halaman invoice — cek pola error boundary existing di halaman itu.
- M-1 (CSP) — kalau setelah deploy ternyata ada component pihak ketiga (mis. dari shadcn/Base UI) yang butuh directive tambahan yang belum di-whitelist, ini ditemukan lewat testing manual §4.1.2, bukan lewat asumsi di spec ini.

## 7. Pengelompokan task (alasan)

4 kelompok (bukan flat 15 task terpisah, bukan juga 1 task raksasa) — tiap kelompok menyentuh area kode yang saling terkait (mis. Kelompok B semua di jalur webhook, Kelompok C semua di jalur auth/registrasi), sehingga review per task tetap fokus dan testable sebagai satu unit, sekaligus menghindari overhead dispatch+review terpisah untuk fix yang cuma 1 baris (L-1/L-2/L-6 masing-masing kecil banget kalau jadi task sendiri-sendiri). Pola ini konsisten dengan Fase 7c yang menggabungkan C-1+H-2 jadi satu task karena fix-nya di file yang sama.

## 8. Testing

- **Pure function baru/berubah** — TDD penuh: `cryptoRandom`/`generateOrderNumber`/`generateRefId` (M-9, pastikan format output tidak berubah, cuma sumber randomness), `safeCompare` (L-1/L-2, kasus sama-persis/beda-panjang/beda-isi), Zod schema `checkoutSchema` (M-4, kasus field terlalu banyak/value terlalu panjang ditolak, kasus normal tetap lolos).
- **Job/route/Server Action orchestration** — tidak ada test otomatis, konsisten konvensi repo.
- **Verifikasi manual sebelum final review:**
  - M-1/M-2: load tiap halaman publik, cek header response (`curl -I`) memuat CSP/X-Frame-Options/dst, buka invoice/deposit — QR tampil normal tanpa request ke domain luar (cek tab Network browser atau `curl` halaman, pastikan tidak ada referensi `api.qrserver.com`).
  - M-5/M-6: coba registrasi dengan email yang sudah ada → pesan sama dengan registrasi baru; coba registrasi dengan email = `ADMIN_EMAIL` → ditolak dengan pesan generik yang sama; jalankan `prisma db seed` dua kali berturut-turut, pastikan role user manapun yang sudah ada tidak berubah.
  - M-7: akses `/account` dkk dengan sesi valid → normal (regresi check, bukan skenario attack — sudah dijaga proxy, ini defense-in-depth).
  - M-3: (kalau kredensial Midtrans sandbox tersedia dari Task 8 Fase 7c) kirim webhook dengan `gross_amount` sengaja beda dari `order.total` tapi signature valid → order TIDAK jadi `PAID`, masuk `NEEDS_REVIEW`.
