# Task 8 — Laporan Verifikasi Akhir Fase 7a

Status keseluruhan: **BLOCKED** — ditemukan bug kode nyata di Task 7 pada Step 3 (automated check), sebelum verifikasi manual (Step 5) sempat dijalankan. Sesuai instruksi task, eksekusi dihentikan di sini alih-alih menutupi bug dengan workaround, dan Task 8 tidak melakukan perubahan source code apa pun untuk memperbaikinya (di luar scope — verifikasi-only).

## Step 1-2: Env var Telegram di `.env.example` — PASS

Ditambahkan 2 baris ke `web/.env.example`:
```
TELEGRAM_BOT_TOKEN="isi-token-bot-dari-botfather"
TELEGRAM_CHAT_ID="isi-chat-id-tujuan-notifikasi"
```
Commit: `148e530` — `docs(fase7a): tambah env var Telegram ke .env.example`.

`web/.env` (tidak di-commit, sudah ada sebelumnya) sudah berisi `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` asli sesuai deskripsi environment dari controller.

## Step 3: Automated check — **PARSIAL, BERHENTI DI BUILD (FAIL)**

Dijalankan dari `web/`:

| Perintah | Hasil |
|---|---|
| `npx vitest run` | **PASS** — 22 file test, 104/104 test lulus, tidak ada regresi. |
| `npx tsc --noEmit` | **PASS** — tidak ada error type. |
| `npm run lint` | **PASS** — 0 error, 2 warning pra-eksisting tidak terkait Fase 7a (`no-img-element` di `account/deposit` dan `invoice`, sudah ada sebelum Fase 7a). |
| `npm run build` | **FAIL (exit code 1)** — lihat detail bug di bawah. |

### Bug yang ditemukan (bukan limitasi environment)

`npm run build` gagal total dengan error Next.js:

```
It is not allowed to define inline "use server" annotated Server Actions in Client Components.
To use Server Actions in a Client Component, you can either export them from a separate file
with "use server" at the top, or pass them down through props from a Server Component.
```

Error muncul untuk keempat action di `web/src/app/actions/orders.ts`
(`retryFulfillmentAction`, `retryRefundAction`, `markCompletedManualAction`, `markRefundedAction`),
semua memakai pola `"use server"` inline per-fungsi (bukan directive file-level).

Root cause: `web/src/app/admin/orders/[orderNumber]/order-actions.tsx` adalah **Client Component**
(`"use client"` di baris 1) yang meng-**import langsung** keempat fungsi tsb dari
`@/app/actions/orders` (baris 6-8):

```ts
import {
  retryFulfillmentAction, retryRefundAction, markCompletedManualAction, markRefundedAction,
} from "@/app/actions/orders";
```

Next.js 16 melarang pola ini ketika file server action memakai `"use server"` inline per-fungsi
(bukan file-level) — larangan ini persis yang didokumentasikan di komentar kode Fase 4 yang sudah
ada di codebase yang sama, `web/src/app/admin/providers/provider-card.tsx:19-24`:

> "Action-action server diterima lewat props dari page.tsx (Server Component), bukan di-import
> langsung di file "use client" ini — actions/providers.ts memakai "use server" inline per-fungsi
> (supaya bisa tetap meng-export Zod schema untuk test), dan Next.js melarang inline "use server"
> di-import langsung oleh Client Component; pola resminya justru "pass them down through props
> from a Server Component"."

Pola yang benar sudah ada dan established di codebase ini: `web/src/app/admin/providers/page.tsx`
(Server Component) meng-import action dari `actions/providers.ts` lalu meneruskannya sebagai props
ke `<ProviderCard toggleProviderActive={...} .../>` (Client Component) — **tidak** ada import
langsung fungsi server action di file `"use client"`.

Task 7 (`web/src/app/admin/orders/[orderNumber]/page.tsx` + `order-actions.tsx`, commit `551017e`)
tidak mengikuti pola ini: `page.tsx` (Server Component) memanggil `<OrderActions orderId=... />`
tanpa meneruskan action apa pun sebagai props, dan `order-actions.tsx` meng-import
`retryFulfillmentAction` dkk langsung di module scope Client Component.

`actions/orders.ts` sendiri berisi komentar (baris 11-14) yang menjelaskan alasan pola
`"use server"` inline per-fungsi dipilih (konsisten dengan `catalog.ts`/`providers.ts`) — tapi
komentar itu tidak menyebut konsekuensi larangan import-langsung-dari-Client-Component, dan
konsumen di Task 7 melanggarnya.

**Ini bukan limitasi environment (bukan Digiflazz IP-whitelist / bukan Midtrans sandbox) — ini
adalah bug arsitektur RSC boundary yang membuat build produksi gagal total (exit code 1),
mempengaruhi seluruh build, bukan cuma satu route.** Tidak lolos kriteria PASS Step 3 brief
("build sukses termasuk route baru").

`vitest`/`tsc`/`lint` tidak menangkap ini karena ketiganya tidak melakukan analisis RSC
client/server module-boundary — hanya `next build` (bundler) yang memvalidasi batas ini.

### Verifikasi tambahan (karakterisasi blast radius, tanpa mengubah kode)

- `npm run dev` (Turbopack) berhasil start tanpa error compile langsung (`✓ Ready in 2.5s`) —
  karena Next.js dev meng-compile route secara lazy/on-demand. Percobaan `curl` ke
  `/admin/orders/TEST-DOES-NOT-EXIST` menghasilkan redirect 302 (middleware auth, sebelum page
  handler ter-invoke), jadi belum sempat memicu compile module graph halaman detail order secara
  penuh dalam dev mode. Tidak dilanjutkan ke login+navigasi manual karena `next build` sudah cukup
  definitif menunjukkan bug nyata, dan melanjutkan verifikasi manual di atas kode yang gagal build
  akan menutupi masalah, bukan memverifikasinya.
- Dev server dihentikan kembali setelah pengecekan ini (port 3000 dikonfirmasi bebas listener).

## Step 4 (setup bot Telegram): N/A

Sesuai instruksi controller, bot Telegram sudah tersedia dengan kredensial asli di `web/.env`
(`t.me/dannshop_bot`) — langkah BotFather di brief dilewati.

## Step 5 (verifikasi manual E2E): **TIDAK TERUJI (diblokir oleh bug Step 3)**

Semua 7 sub-langkah Step 5 (kasus NEEDS_REVIEW (a)/(b), REFUND_PENDING, filter tab
`/admin/orders`, "Tandai Selesai Manual") **tidak dijalankan** — 5 dari 7 sub-langkah bergantung
langsung pada halaman `/admin/orders/[orderNumber]` yang tidak bisa di-build untuk produksi karena
bug di atas. Menjalankan verifikasi manual di `npm run dev` saja (yang mungkin tidak memicu error
yang sama sampai route benar-benar diakses) berisiko memberi sinyal PASS palsu untuk kode yang
akan gagal saat `next build` — bertentangan dengan instruksi eksplisit task ("STOP dan laporkan
BLOCKED... jangan menutupi bug nyata").

Tidak ada data uji (Order/WalletLedger/AdminActionLog/OrderFulfillment) yang sempat dibuat di DB,
tidak ada `ProviderSku`/`Wallet` yang sempat diubah — jadi tidak ada cleanup DB yang diperlukan
untuk Step 7.

## Kesimpulan & rekomendasi

Task 8 **tidak bisa dilanjutkan/diselesaikan** sampai bug RSC boundary di atas diperbaiki oleh
perubahan kode (di luar scope Task 8 yang verifikasi-only). Perbaikan yang selaras dengan pola
established di codebase ini (lihat `provider-card.tsx` + `providers/page.tsx`):

1. Di `web/src/app/admin/orders/[orderNumber]/page.tsx` (Server Component): import keempat action
   dari `@/app/actions/orders` dan teruskan sebagai props ke `<OrderActions .../>`.
2. Di `web/src/app/admin/orders/[orderNumber]/order-actions.tsx`: hapus import langsung
   `retryFulfillmentAction`/`retryRefundAction`/`markCompletedManualAction`/`markRefundedAction`
   dari `@/app/actions/orders`; terima keempatnya sebagai props (tipe `ServerAction = (formData:
   FormData) => Promise<ActionResult>`, sama seperti `ProviderCardProps`).
3. Setelah fix, ulangi Step 3 (automated check penuh) sampai `npm run build` PASS, baru lanjutkan
   Step 5 (manual E2E) dan sisa langkah Task 8.

Tidak ada bagian yang disintesis (Midtrans/Digiflazz) karena verifikasi manual belum sempat
dimulai — task berhenti di automated check (Step 3).
