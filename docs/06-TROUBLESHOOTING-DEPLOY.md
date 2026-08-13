# 06 — Menjalankan Lokal, Deploy, & Troubleshooting

## 1. Menjalankan Project di Lokal

### 1.1 Requirement

- **Node.js** (versi yang kompatibel dengan Next.js 16 — pakai versi LTS terbaru).
- **MySQL** berjalan lokal (proyek ini sebelumnya dikembangkan dengan Laragon di Windows — kalau pakai Laragon, servicenya **tidak auto-start**, harus di-start manual lewat GUI-nya atau langsung jalankan `mysqld.exe`).
- Semua command di bawah dijalankan dari dalam folder **`web/`** (bukan root repo) — `cd "D:\Coding VSC\DannShop-PPOB\web"` dulu.

### 1.2 Setup awal (sekali saja)

```bash
cd web
npm install
cp .env.example .env    # lalu isi semua nilainya — lihat penjelasan tiap variabel di dalam .env.example
npx prisma migrate dev   # bikin skema di database lokal
npx tsx prisma/seed.ts   # (opsional) isi data awal kategori & metode pembayaran
```

> `npm install` otomatis menjalankan `npx prisma generate` lewat script `postinstall` di `package.json` — kalau ini gagal (lihat §3.3), jalankan manual `npx prisma generate`.

### 1.3 Menjalankan dev server

```bash
cd web
npm run dev
```
Buka `http://localhost:3000`.

### 1.4 Command penting lainnya

| Command | Fungsi |
|---|---|
| `npm run build` | Build production (juga dipakai Vercel saat deploy). |
| `npm run start` | Jalankan hasil build (`npm run build` dulu). |
| `npm run lint` | ESLint. |
| `npm run test` | Jalankan semua unit test (Vitest, `web/tests/`). |
| `npx tsc --noEmit` | Cek error TypeScript tanpa build penuh (paling cepat untuk cek kesalahan tipe). |
| `npx prisma studio` | Buka GUI browser untuk lihat/edit isi database langsung. |

## 2. Build & Deploy

### 2.1 Target hosting

- **Aplikasi:** Vercel (Next.js). Konfigurasi region di `web/vercel.json` — di-pin ke `sin1` (Singapura) supaya dekat dengan database (mengurangi latency checkout).
- **Database:** MySQL-compatible (production pakai TiDB Cloud Serverless — wire-protocol kompatibel MySQL, jadi tidak perlu ubah apa pun di Prisma).
- **Cron:** **BUKAN** cron bawaan Vercel — dipanggil dari layanan cron eksternal (proyek ini pakai cron cPanel Rumahweb) yang memanggil `POST https://domainmu.com/api/cron/tick` tiap menit dengan header `x-cron-secret: <nilai CRON_SECRET>`. Kalau cron eksternal ini berhenti berjalan, semua job background (expire order/deposit, sinkronisasi harga, callback mitra, dll.) juga berhenti — lihat `docs/01-ARSITEKTUR.md` §6.

  > #### ⚠️ Jebakan #1 cron eksternal: URL-nya menunjuk domain Vercel yang sudah mati
  >
  > **Ini sudah benar-benar terjadi di proyek ini — cron mati 4 hari tanpa satu pun gejala.**
  >
  > URL cron disimpan di panel cPanel, **di luar repo**, jadi tidak ikut berubah saat domain Vercel berganti (rename project, hapus-buat ulang, ganti domain kustom). Domain Vercel yang sudah tidak dipakai **tetap menjawab** — dengan `HTTP 404` + header `X-Vercel-Error: DEPLOYMENT_NOT_FOUND`. Bukan DNS error, bukan timeout: sebuah balasan HTTP yang rapi dan cepat. Kebanyakan layanan cron menganggap itu "berhasil dipanggil" dan tidak pernah memberi tahu siapa pun.
  >
  > **Cara memeriksanya dalam 5 detik** — jalankan untuk URL yang PERSIS tertulis di cron cPanel:
  > ```bash
  > curl -s -o /dev/null -w "%{http_code}\n" -X POST https://URL-YANG-DI-CPANEL/api/cron/tick
  > ```
  > - `401` → **domainnya benar** (endpoint hidup, cuma menolak karena tidak dikirimi secret). Lanjut ke jebakan #2.
  > - `404` → **domainnya salah/mati.** Ini penyebabnya. Ganti URL di cron cPanel ke domain yang sekarang.
  >
  > #### ⚠️ Jebakan #2: `CRON_SECRET` belum terpasang vs secretnya salah
  >
  > Dulu keduanya membalas `401` yang identik sehingga mustahil dibedakan dari luar. **Sejak sekarang balasan 401 menyertakan `reason` + `message`** (`lib/jobs/cron-auth.ts`):
  > ```bash
  > curl -s -X POST https://domainmu.com/api/cron/tick | jq
  > # {"error":"Unauthorized","reason":"secret_not_configured","message":"CRON_SECRET belum dipasang ... lalu REDEPLOY"}
  > # {"error":"Unauthorized","reason":"no_secret_sent",...}
  > # {"error":"Unauthorized","reason":"secret_mismatch",...}
  > ```
  > Membocorkan alasan ini aman — tidak ada nilai rahasia yang ikut keluar, dan endpoint tetap fail-closed. Ada test regresinya di `tests/cron-auth.test.ts`.
  >
  > **Ingat:** menambah/mengubah env di Vercel **tidak berlaku untuk deployment yang sudah jalan** — wajib **redeploy** sesudahnya.
  >
  > #### 🔔 Sekarang matinya cron tidak lagi senyap
  >
  > Tiap tick yang lolos autentikasi mencatat detak ke `SiteSetting["cron_last_tick_at"]` (`lib/jobs/heartbeat.ts`), dan **dashboard admin menampilkan banner merah kalau detak terakhir lebih dari 15 menit lalu** — lengkap dengan jumlah job yang menumpuk. Pemicunya admin membuka panel, jadi peringatan ini **tidak bergantung pada cron yang justru sedang mati**. Kalau lihat banner itu, kerjakan dua jebakan di atas berurutan.
- **File storage:** Vercel Blob (untuk semua gambar upload).

### 2.2 Environment variables yang wajib diset di Vercel

Cek `web/.env.example` untuk daftar lengkap + penjelasan tiap variabel. Semua di-set lewat Vercel Dashboard → Project → Settings → Environment Variables (scope Production, dan Preview kalau perlu preview deployment yang benar-benar berfungsi).

### 2.3 ⚠️ Migrasi database TIDAK otomatis — WAJIB dilakukan manual

**Ini penyebab insiden production down yang PERNAH benar-benar terjadi di proyek ini.** Baca `docs/05-CARA-TAMBAH-FITUR.md` §5 untuk detail lengkap. Ringkasnya:

- Pipeline deploy Vercel di proyek ini cuma menjalankan `next build` — TIDAK ADA langkah migrasi database di dalamnya.
- Kalau ada perubahan skema (`schema.prisma`) yang di-push ke `main` tapi migrasinya belum diterapkan ke database production, `next build` bisa **gagal secara senyap saat pre-render halaman** yang query kolom/tabel baru itu — dan karena build gagal, Vercel terus menyajikan **build LAMA yang masih berfungsi normal secara kasat mata** (return 200, tidak ada pesan error yang terlihat pengunjung). Baru ketahuan kalau ada yang cek log build Vercel secara khusus.
- **Checklist sebelum/setelah push kalau ada migrasi baru:**
  1. `npx prisma migrate dev` di lokal (bikin migrasi).
  2. Push kode ke `main`.
  3. **`cd web && npx dotenv -e .env.production -- npx prisma migrate deploy`** — WAJIB, jangan diskip.
  4. Verifikasi: buka situs production, cek halaman yang pakai kolom/tabel baru benar-benar berfungsi (bukan cuma "situsnya kebuka", karena build lama pun akan tetap "kebuka").

## 3. Masalah Umum & Solusinya

### 3.1 Dev server error aneh setelah restart (Windows + Turbopack)

**Gejala:** `EPIPE`, "Jest worker encountered N child process exceptions", atau port 3000 terasa "dipakai" padahal seharusnya sudah dimatikan.

**Penyebab:** Di Windows, kalau proses `node.exe` lama (dev server sebelumnya) belum benar-benar mati saat dev server baru dijalankan, dua proses bentrok di port yang sama.

**Solusi:**
```powershell
# Cek proses node yang masih hidup
tasklist /FI "IMAGENAME eq node.exe"
# Matikan semua (ganti <PID> dengan PID yang muncul, atau taskkill semua node.exe)
taskkill /F /IM node.exe
# Hapus cache build, lalu jalankan ulang
rm -rf .next
npm run dev
```
**Jangan cuma percaya notifikasi "server berhasil dimatikan"** dari terminal/tool apa pun — selalu verifikasi dengan cek langsung apakah port 3000 masih merespons (`curl http://localhost:3000`) sebelum menjalankan ulang.

### 3.2 `npx prisma migrate dev` / `migrate deploy` dijalankan dari folder yang salah

**Gejala:**
```
Error: Could not find Prisma Schema that is required for this command.
```
**Penyebab:** Command dijalankan dari root repo (`D:\Coding VSC\DannShop-PPOB`), padahal schema-nya ada di `web/prisma/schema.prisma`.

**Solusi:** Selalu `cd web` dulu sebelum command Prisma apa pun. Kalau command dijalankan dari folder yang salah, `npx` juga bisa mencoba **mengunduh** versi Prisma terbaru dari internet (karena tidak menemukan instalasi lokal), yang bisa beda versi dari yang dipakai proyek ini (`^6.19.3`) — kalau muncul prompt "Ok to proceed?" untuk instalasi Prisma versi lain, **jangan di-accept**, batalkan dan pastikan sudah di folder `web/`.

### 3.3 `prisma generate` gagal dengan `EPERM`

**Gejala:** Error permission saat rename file `.dll` engine Prisma.

**Penyebab:** Dev server (yang mengunci file `query_engine-windows.dll`) masih berjalan saat `prisma generate` dijalankan.

**Solusi:** Matikan dev server dulu (§3.1), baru jalankan `npx prisma generate` lagi.

### 3.4 Vercel: semua halaman 404, log runtime kosong sama sekali

**Penyebab yang PERNAH terjadi:** Vercel "Framework Preset" ter-reset diam-diam ke "Other" (biasanya efek samping mengubah "Root Directory" lewat dashboard tanpa Next.js auto-detection ter-trigger ulang). Build tetap sukses (`next build` jalan normal, log build bersih), tapi Vercel tidak tahu harus pakai Next.js serverless adapter, jadi mencari folder static biasa — semua route 404 di level routing Vercel, request bahkan tidak pernah sampai ke kode aplikasi (makanya log runtime kosong total).

**Solusi (via Vercel CLI, jauh lebih cepat dari klik-klik dashboard):**
```bash
vercel project ls                              # pastikan nama project yang benar
vercel project inspect <nama-project>          # cek baris "Framework Preset" — kalau "Other", ini penyebabnya
vercel project update <nama-project> --framework nextjs
vercel --prod                                   # WAJIB deploy ulang, deployment lama yang sudah "Ready" tidak otomatis benar
```

### 3.5 `vercel link` membuat project BARU secara diam-diam

**Penyebab:** `vercel link` tanpa flag `--project` bisa membuat project baru bernama sesuai folder, bukan link ke project yang sudah ada — bahkan dengan flag `--yes`.

**Solusi:** selalu `vercel link --project <nama-persis-project>` secara eksplisit. Jalankan dari **root repo**, bukan dari dalam `web/` (karena Root Directory project ini sudah di-set ke `web` di pengaturan Vercel — kalau `vercel link`/`vercel --prod` dijalankan dari dalam `web/` juga, Root Directory itu diterapkan DOBEL, hasilnya mencari `web/web` yang tidak ada).

### 3.6 Root Directory monorepo membingungkan

Repo ini monorepo (aplikasi Laravel lama di root + aplikasi Next.js aktif di `web/`) — Vercel project-nya sudah dikonfigurasi Root Directory = `web`. Kalau bikin project Vercel baru dari repo ini, JANGAN lupa set Root Directory itu di awal, atau semua command Vercel CLI harus dijalankan dari root repo (bukan dari dalam `web/`) supaya path Root Directory itu diresolusi dengan benar (lihat §3.5).

### 3.7 `npm install` gagal dengan `ERESOLVE` / peer dependency conflict

**Contoh nyata yang pernah terjadi:** menambah package `nodemailer` versi baru gagal karena `next-auth` sudah menarik versi `nodemailer` lain (lebih lama, punya celah keamanan) sebagai dependency tidak langsung, dan versi barunya tidak cocok dengan rentang versi yang diizinkan `next-auth`.

**Solusi:** tambahkan blok `overrides` di `web/package.json` untuk memaksa versi yang diinginkan di seluruh pohon dependency:
```json
{
  "overrides": {
    "nodemailer": "^9.0.4"
  }
}
```
Lalu `npm install` ulang, dan verifikasi dengan `npm ls <nama-package>` (harus bersih, tidak ada pesan "invalid").

### 3.8 ESLint error "Cannot call impure function during render" (`react-hooks/purity`)

**Gejala:** Lint gagal di baris yang memanggil `new Date()` atau `Date.now()` tanpa argumen, langsung di dalam badan komponen (termasuk Server Component async) atau di dalam callback `.map()` yang merender JSX.

**Penyebab:** Aturan React Compiler ini menganggap SEMUA komponen (termasuk Server Component yang sebenarnya cuma jalan sekali per request) berpotensi "re-render", dan memanggil waktu-sekarang langsung di situ dianggap tidak murni (impure).

**Solusi:** hitung `const now = new Date();` **sekali** di baris paling atas fungsi komponen (di luar JSX), lalu pakai `now` (atau `now.getTime()`, atau `new Date(now.getTime() - x)`) di mana pun butuh nilai waktu — JANGAN panggil `new Date()`/`Date.now()` tanpa argumen berulang kali di tempat lain dalam komponen yang sama.

### 3.9 Email tidak terkirim (invoice, notifikasi order)

**Cek urutan ini:**
1. Sudah dikonfigurasi lewat `/admin/settings` bagian "Pengiriman Email (Resend/SMTP)"? Kalau belum pernah diisi, sistem cuma mencatat log `"Email: provider belum dikonfigurasi"` dan pengiriman dilewati — **checkout/pembayaran tetap berfungsi normal**, cuma emailnya yang tidak terkirim (ini disengaja, supaya masalah email tidak pernah menghentikan transaksi uang).
2. Kalau pakai Resend: domain pengirim (`fromEmail`) harus sudah terverifikasi di dashboard Resend (SPF/DKIM) — kalau belum, Resend akan menolak pengiriman.
3. Kalau pakai SMTP: cek host/port/kredensial benar, dan `secure` (TLS langsung, biasanya untuk port 465) sudah sesuai dengan yang diminta provider SMTP-nya.

### 3.10 Order/pesanan "macet" tidak berubah status

Cek halaman admin `/admin/jobs` — kalau ada job berstatus "Gagal" (`FAILED`) untuk tipe `recheck-fulfillment`, itu tandanya proses cek ulang status ke provider PPOB terus gagal. Cek juga `/admin/webhooks` untuk lihat apakah notifikasi dari Midtrans benar-benar masuk. Detail alur lengkap: `docs/04-INTEGRASI-PAYMENT-PPOB.md`.

---

## Cheat Sheet — Deploy & Troubleshooting

| Masalah | Solusi singkat |
|---|---|
| Command Prisma error "schema not found" | `cd web` dulu |
| Dev server error setelah restart (Windows) | `taskkill /F /IM node.exe` → `rm -rf .next` → `npm run dev` |
| `prisma generate` EPERM | Matikan dev server dulu |
| Vercel: semua halaman 404 | Cek `vercel project inspect`, pastikan Framework Preset = Next.js |
| `vercel link` bikin project baru | Selalu pakai `--project <nama>` eksplisit, jalankan dari root repo |
| `npm install` ERESOLVE | Tambah `overrides` di `package.json` |
| Lint error "impure function" | Hitung `new Date()` sekali di atas fungsi, jangan berulang |
| Email tidak terkirim | Cek `/admin/settings` sudah dikonfigurasi + domain terverifikasi (Resend) |
| Order macet | Cek `/admin/jobs` dan `/admin/webhooks` |
| **Push kode dengan migrasi baru** | **JANGAN LUPA** `npx dotenv -e .env.production -- npx prisma migrate deploy` |
