# 11 — Fitur Reseller, RBAC, Modal/Laba & PWA (Agustus 2026)

Empat fitur besar yang lahir dalam satu jendela waktu (16–18 Agustus 2026),
ditulis di satu dokumen karena saling berkaitan: RBAC membuat karyawan bisa
diberi akses terbatas, program reseller butuh RBAC untuk dikelola karyawan,
dan pelacakan modal butuh keduanya untuk laporan laba yang bisa dipercaya.
Gaya dokumen ini beda dari `01`–`08`: bukan referensi struktur, tapi **kenapa
dibangun begini** — keputusan desain yang penting diketahui sebelum
mengubahnya. Penerus `docs/09` dan `docs/10` yang sudah diarsipkan.

> 💡 Kalau baru pertama kali baca dokumen ini: `docs/03-BACKEND-API.md` §5.3
> punya tabel referensi cepat untuk RBAC (9 izin, peta route), dan
> `docs/01-ARSITEKTUR.md` §3.1 punya diagram alur beli paket reseller. Dokumen
> ini melengkapi keduanya dengan alasan di baliknya, bukan menggantikannya.

---

## 1. Program Reseller

Menggantikan sistem membership lama (`/membership`, tier LIFETIME dibayar
Midtrans langsung, `UserMembership`) — jalur baru lewat `ResellerAccount`.

### 1.1 Kenapa migrasinya nyaris tidak terasa oleh kode lama

Kuncinya `getMembershipContext()` — fungsi yang dulu membaca `UserMembership`
langsung, sekarang membaca `ResellerAccount`, tapi **bentuk keluarannya
persis sama**. Efeknya: 16 pemanggil (checkout, katalog, dashboard, dll.)
nol disentuh saat migrasi ini masuk. Kalau menambah sumber diskon baru di
masa depan, pola yang sama berlaku — ubah isi fungsi, jangan ubah bentuknya,
dan sisir semua pemanggil untuk pastikan asumsi lama masih berlaku.

### 1.2 Pendaftaran — dua pintu, satu jalur

`web/src/lib/reseller/registration.ts`. Dua cara masuk:

- **Publik** (`/daftar-reseller`) — orang belum punya akun, isi email+password sekalian.
- **Dari akun** (`/account/reseller`) — email & password tidak diminta lagi, sudah dimiliki.

Keduanya berakhir sama: sebuah `ResellerAccount` **belum aktif** + satu link
aktivasi (30 menit, sekali pakai) dikirim ke email. Aktivasinya
(`activateReseller()`) punya klaim atomik (`updateMany ... where usedAt: null`)
supaya dua klik pada link yang sama — pemindai tautan penyedia email +
manusianya — cuma satu yang menang. Yang kalah **tidak** diperlakukan sebagai
galat kalau akunnya memang sudah aktif, supaya orang yang mengklik link yang
sama dua kali tidak mengira pendaftarannya batal.

> 💡 Untuk pendaftar publik, aktivasi ini jugalah satu-satunya verifikasi
> email yang pernah terjadi — `emailVerifiedAt` ditandai di titik yang sama.

### 1.3 Paket — LIFETIME, dan GRATIS bukan sebuah baris

`ResellerAccount.tierId` opsional. Paket **gratis** direpresentasikan
`tierId = null`, bukan baris `MembershipTier` tersendiri — reseller gratis
tetap punya `ResellerAccount`, cuma tanpa tier terpasang.

Tier bersifat **seumur hidup**, sekali bayar. `MembershipTier.durationDays`
sudah usang dan dihapus dari semua form — tidak ada perpanjangan, dan (lihat
di bawah) tidak ada penurunan.

### 1.4 Kredit upgrade — dari yang DIBAYAR, bukan harga hari ini

`web/src/lib/reseller/upgrade.ts`, fungsi `quoteUpgrade()`. Ini bagian yang
paling mudah salah kalau ditulis ulang tanpa membaca alasannya:

Kredit dihitung dari `ResellerAccount.tierPricePaid` — nominal yang **benar-benar
dibayar** dulu — bukan dari harga tier hari ini. Bedanya baru muncul kalau
pemilik toko **menurunkan** harga sebuah paket setelah seseorang membelinya:
mengambil dasar "harga hari ini" menghukum pembeli lama karena promo yang
tidak pernah dia nikmati, sementara dasar "yang dibayar" selalu mengkredit
persis sebesar uang yang benar-benar masuk — tidak pernah lebih, tidak pernah
kurang. Kreditnya **dijepit** supaya tidak melebihi harga tujuan (bukan hasil
akhirnya) — supaya tampilan `harga − kredit = bayar` selalu masuk akal di
mata pembeli.

**Penurunan paket tidak diizinkan sama sekali** — `canUpgradeTo()` menolak
kalau harga tujuan ≤ yang sudah dibayar. Alasannya sejalan dengan sifat
LIFETIME: tidak ada "downgrade lalu refund selisih", cuma satu arah, naik.

### 1.5 Beli paket — lewat `settleFromMidtrans()` cabang ke-3

`buyResellerTier()` (`actions/reseller.ts`) membuat `TierPurchase` berstatus
`PENDING` + tagihan Midtrans, persis pola checkout/deposit. Saat Midtrans
konfirmasi lunas, `settleFromMidtrans()` mencocokkan `order_id` ke tabel
`TierPurchase` sebagai percobaan **ketiga** (setelah `Order` dan `Deposit`
gagal cocok) — lihat `docs/04-INTEGRASI-PAYMENT-PPOB.md` §2.7. Kalau nominal
tidak cocok, paket **tidak diberikan sama sekali**, sama seperti dua cabang
lainnya.

### 1.6 Potongan FLAT untuk produk MANUAL (fitur terbaru, sesi 18 Agustus)

Sebelumnya seluruh diskon tier berbentuk persentase (`discountBp`), berlaku
rata ke semua produk. Kebutuhan baru: paket reseller bisa memberi **potongan
rupiah tetap**, tapi **hanya** untuk produk `fulfillmentMode: MANUAL` — dan
di situ ia **menggantikan** persen, bukan ditumpuk di atasnya (`effectivePrice()`,
`web/src/lib/pricing/effective-price.ts`):

```ts
if (isManual && discountFlat > 0n) {
  const discounted = item.sellingPrice - discountFlat;
  return discounted < item.memberPrice ? item.memberPrice : discounted;
}
```

Alasan tidak ditumpuk: menumpuk keduanya berarti satu paket memberi **dua**
potongan sekaligus justru di produk yang marginnya paling tipis (manual =
biasanya jasa/kustom, bukan barang digital massal). Tetap dijepit ke
`memberPrice` (harga modal) — potongan flat sebesar apa pun tidak bisa
membuat toko jual rugi.

`effectivePrice()` menerima dua parameter baru (`discountFlat`, `isManual`)
dengan default aman (`0n`, `false`) — pemanggil lama yang belum meneruskan
keduanya berperilaku identik seperti sebelum fitur ini ada. Migrasi
`20260818140000_add_tier_flat_discount` cuma menambah satu kolom
`DEFAULT 0`, aditif total.

---

## 2. RBAC — Karyawan & Peran

Menggantikan sistem 2-role (`USER`/`ADMIN`) dengan role ketiga `STAFF` yang
akses panelnya dibatasi izin. Tabel referensi lengkap (9 izin, peta route,
tiga lapis penegakan) ada di `docs/03-BACKEND-API.md` §5.3 — bagian ini fokus
pada **keputusan desain**, bukan mengulang tabelnya.

### 2.1 Kenapa 16 salinan `requireAdmin` disatukan

Sebelum RBAC, tiap berkas `app/actions/*.ts` punya fungsi lokal
`requireAdmin()` sendiri — **16 salinan**, dan salinannya sudah mulai
berbeda satu sama lain. Alasan lama untuk menyalinnya ("berkas `use server`
cuma boleh ekspor async function") **keliru**: berkas-berkas itu menaruh
`"use server"` di dalam badan fungsi, bukan di level modul, jadi bebas
mengimpor apa saja. Bahayanya bukan soal rapi — Server Action adalah
endpoint HTTP, dan satu salinan yang ketinggalan diperbarui berarti sebuah
aksi masih bisa dipanggil oleh orang yang tidak berhak, tanpa error, tanpa
tanda apa pun. Disatukan jadi `lib/auth/admin-gate.ts` sekaligus dengan
kelahiran RBAC, karena keduanya sama-sama menuntut "satu sumber kebenaran
untuk siapa boleh apa".

### 2.2 Kenapa kelola karyawan BUKAN sebuah izin

`StaffRole` & penugasannya dikunci ke `requireOwner()` — role `ADMIN` murni,
tidak bisa didelegasikan lewat izin apa pun. Kalau ia jadi izin biasa,
karyawan yang memegangnya bisa menaikkan izinnya sendiri (atau izin
temannya) sampai setara pemilik toko, dan tidak ada satu pun error yang akan
menandainya — ini satu-satunya kelas kesalahan RBAC yang tidak bisa dideteksi
lewat pengujian biasa, cuma lewat menyadari desainnya salah dari awal.

### 2.3 Kenapa karyawan diangkat dari akun yang sudah ada, bukan dibuatkan

`assignStaffRole()` (`app/actions/staff.ts`) mengangkat user yang **sudah
mendaftar sendiri** lewat form daftar biasa (dengan password yang tidak
pernah dilihat pemilik toko) — bukan membuat akun baru berikut passwordnya
di panel. Kalau pemilik toko pernah memegang password karyawannya, setiap
jejak audit yang mencatat "dilakukan oleh karyawan X" kehilangan artinya —
tidak ada cara membuktikan aksi itu benar-benar dilakukan karyawan itu,
bukan pemilik toko yang login memakai kredensialnya.

### 2.4 Efek samping yang disengaja: mengangkat karyawan menendang sesinya

`assignStaffRole()` menulis ke tabel `User` (`role`, `staffRoleId`), yang
menaikkan `updatedAt` — dan `proxy.ts` menendang sesi mana pun yang
`updatedAt`-nya tidak lagi cocok dengan JWT (lihat
`docs/03-BACKEND-API.md` §5.2 untuk mekanisme umumnya). Di sinilah efek
samping itu justru **diinginkan**: hak akses yang berubah harus berlaku
seketika, bukan menunggu token lama habis sampai 12 jam kemudian. Pesan
suksesnya ("...Dia perlu login ulang.") sengaja mengingatkan hal ini.

### 2.5 Kenapa menghapus peran yang masih dipakai ditolak

`deleteStaffRole()` menolak kalau masih ada karyawan yang memegang peran
itu (`role._count.users > 0`). `staffRoleId` di `User` memang `ON DELETE
SET NULL`, jadi secara teknis penghapusan tidak akan error — tapi karyawan
yang perannya lenyap kehilangan **seluruh** izin sekaligus tanpa peringatan
apa pun. Lebih aman ditolak dan memaksa admin memindahkan mereka dulu (atau
cukup menonaktifkan peran itu, yang mencabut izin tapi tetap meninggalkan
jejak penugasan).

---

## 3. Modal & Laba

Sebelum fitur ini, panel tidak tahu berapa **modal** sebuah order — cuma
harga jual. Dashboard & analytics lama menghitung "laba" dengan asumsi
modal nol, yang berarti angkanya selalu terlihat sangat bagus dan sepenuhnya
bohong.

### 3.1 Dua sumber modal, dan kenapa keduanya diisi di waktu berbeda

`web/src/lib/order/cost-snapshot.ts`, fungsi `initialOrderCostPrice()`:

| Mode | Sumber modal | Diisi kapan |
|---|---|---|
| `MANUAL` | `ProductItem.costPrice` (diketik admin) | **Saat checkout** — modalnya sudah pasti sejak awal. |
| `AUTO` | `ProviderSku.costPrice` (milik provider yang dipakai) | **Saat fulfillment berhasil** — provider mana yang benar-benar memproses baru pasti setelah pengiriman selesai; *failover* bisa memindahkannya ke provider lain dengan modal berbeda. |

Mengisi modal AUTO saat checkout berarti mencatat modal provider yang
ternyata tidak pernah memproses apa pun (kalau terjadi failover). `null`
untuk AUTO di titik checkout artinya **"diisi jalur fulfillment nanti"**,
bukan "belum tahu, anggap nol".

### 3.2 Kenapa modal di-*snapshot*, bukan dibaca ulang

`Order.costPrice` adalah salinan yang dibekukan pada saat itu — persis
seperti `sellingPrice`/`productName` yang juga sudah lebih dulu di-snapshot
di order. Membaca ulang modal dari produk saat menyusun laporan akan salah
dengan cara yang tidak kelihatan: modal berubah tiap kali harga provider
disinkronkan, jadi laporan bulan lalu akan ikut bergeser setiap kali harga
**hari ini** berubah — dan angkanya tidak pernah lagi cocok dengan uang yang
benar-benar keluar saat transaksi itu terjadi.

### 3.3 🔴 `null` ≠ nol — aturan yang wajib dipegang siapa pun yang menyentuh laporan

`computeProfit()` (`cost-snapshot.ts`) memisahkan order bermodal tercatat
dari yang tidak, alih-alih menganggap yang tidak tercatat bermodal nol:

```ts
if (order.costPrice === null) {
  revenueWithoutCost += order.total;
  ordersWithoutCost += 1;
  continue;   // TIDAK ikut menghitung profit
}
```

Kalau order tanpa modal dianggap bermodal nol, labanya terbaca 100% —
angka yang sangat bagus dan sepenuhnya bohong. Yang benar adalah
mengeluarkannya dari perhitungan **dan** melaporkan berapa banyak yang
dikeluarkan (`ordersWithoutCost`), supaya admin tahu seberapa jauh angka
laba ini bisa dipercaya. Margin (`marginBp`) juga dihitung HANYA dari basis
yang modalnya diketahui — membaginya dengan seluruh omzet akan membuat
persentase selalu terlihat lebih kecil dari kenyataan, sebanding dengan
berapa banyak modal yang belum terisi.

### 3.4 Dashboard & analytics — satu sumber, bukan query tersebar

`web/src/lib/reports/overview.ts`, fungsi `getOverview()`. Dashboard dan
halaman analytics menampilkan angka yang sama dengan bingkai berbeda, dan
dua salinan query yang "kurang lebih sama" adalah cara paling gampang
membuat dua halaman melaporkan omzet berbeda untuk periode yang sama — jadi
disatukan di satu fungsi, dipanggil kedua halaman.

Beberapa detail yang gampang salah kalau ditulis ulang:

- **Kunci hari dihitung dari waktu LOKAL**, bukan `toISOString()` — `toISOString()`
  akan menggeser hari untuk WIB (UTC+7), membuat transaksi jam 2 pagi
  masuk hitungan hari sebelumnya.
- **Hari tanpa transaksi tetap muncul sebagai nol** di grafik harian
  (`dateRange()` mengisi deret tanggal penuh). Kalau cuma hari yang ada
  datanya yang digambar, grafiknya diam-diam memampatkan waktu, dan
  penurunan drastis (mis. toko down 3 hari) terlihat seperti garis yang
  baik-baik saja.
- **Kategori dipetakan lewat query kedua**, bukan `include` — `Order`
  menyimpan `productItemId` sebagai skalar tanpa relasi Prisma (kategorinya
  sendiri sudah di-snapshot lewat `productName`/`itemName`). Item yang sudah
  dihapus tidak ketemu di query kedua, dan itu ditangani sebagai "Tanpa
  kategori" — bukan dilempar sebagai error, karena order lamanya tetap
  harus terhitung.

Grafiknya dirender pakai **Recharts**, dan warnanya diambil dari CSS
variable (bukan `useTheme()` — nilai dari state React tertinggal satu
render di belakang saat tema berganti, dan pada render server pertama
nilainya belum ada sama sekali). Palet warnanya divalidasi lewat skrip,
bukan ditebak — tebakan pertama sempat gagal kontras.

---

## 4. PWA — Ikon & Layar Pembuka

### 4.1 Dua app, satu domain, dibedakan lewat `id` manifest

Toko (`/`) dan Admin (`/admin`) adalah dua aplikasi PWA terpisah pada origin
yang sama, dibedakan field `id` di manifest masing-masing (`PwaAppKind =
"toko" | "admin"`, `web/src/lib/pwa/config.ts`). Admin punya manifest
sendiri di `/admin/app.webmanifest` — **bukan** konvensi `manifest.ts`
Next.js (yang cuma berlaku di akar `app/` dan sudah dipakai app toko),
melainkan Route Handler biasa.

### 4.2 Tiga layar pembuka berbeda, dan cuma satu yang benar-benar bisa dikendalikan

| # | Layar pembuka | Bisa dikendalikan? |
|---|---|---|
| 1 | Splash bawaan Android | **Tidak.** Chrome merakitnya sendiri dari `background_color` + ikon 512 pada ukuran tetap. Yang bisa dilakukan cuma membuat warna latar menyatu dengan ikon supaya tidak terlihat seperti logo ditempel di kotak. |
| 2 | Layar pembuka iOS (`apple-touch-startup-image`) | Sebagian — lihat §4.3. Tanpa tag ini iOS menampilkan layar **kosong**. |
| 3 | Layar pembuka DI DALAM app (`components/pwa/app-splash.tsx`) | **Sepenuhnya** — bisa dibuat sebesar apa pun, berlaku Android & iOS. |

### 4.3 Splash iOS dibuat *on-demand*, nol berkas gambar di repo

iOS memilih gambar splash lewat media query yang mencocokkan ukuran layar
**persis** — perangkat yang tidak terdaftar di `IOS_DEVICES` tidak jatuh ke
gambar terdekat, ia kembali ke layar kosong. Proyek ini mendaftar **19
perangkat** (iPhone SE gen 1 sampai 16 Pro Max, plus 7 model iPad), potret
**dan** lanskap masing-masing → **38 tag** `<link>` per halaman. Terdengar
boros, tapi isinya nyaris identik satu sama lain sehingga setelah gzip
tambahannya ~1KB (dikonfirmasi, lihat memori sesi 5).

Gambarnya dirender **on-demand** oleh route `/pwa/splash` (`next/og`) — satu
fungsi merender ukuran berapa pun yang diminta, bukan 38 berkas PNG yang
diproduksi dan disimpan di repo. Sisi kanvas dibatasi 3000px
(`SPLASH_MAX_SIDE`) supaya URL yang dikarang orang (`?w=9000&h=9000`) tidak
menghabiskan memori fungsi.

> ⚠️ **Sumber gambar diambil jadi data URI SEBELUM diserahkan ke satori**
> (mesin render `next/og`). Satori merender di dalam stream, jadi
> `try/catch` di sekitar pemanggilannya mustahil menangkap kegagalan fetch
> gambar — kegagalannya baru muncul jauh di dalam proses streaming.
> Mengambil gambar sumber lebih dulu (di luar satori) membuat kegagalan itu
> bisa ditangkap normal, sebelum proses render dimulai sama sekali.

Cache gambarnya **selamanya**, dibongkar lewat parameter `v` (`appearanceVersion()`
— sidik jari FNV-1a dari warna+ikon+splash). Ganti apa pun yang mempengaruhi
rupa layar pembuka → `v` berubah → URL berubah → perangkat mengambil yang
baru. Tanpa mekanisme ini pilihannya cuma dua, dan dua-duanya buruk: cache
pendek (tiap pemasangan me-render ulang gambar 2732px) atau cache panjang
(perubahan admin tidak pernah sampai ke HP yang sudah pasang app-nya).

### 4.4 Ikon dibuat di browser, dua varian dari satu upload

`web/src/lib/pwa/icon-builder.ts`. Admin unggah satu gambar, browser
(canvas) menghasilkan dua PNG:

- **`any`** — logo mengisi 80% sisi kanvas.
- **`maskable`** — logo dibatasi ke **58%** sisi kanvas. Peluncur Android
  memotong ikon `maskable` dengan bentuk yang beda-beda (lingkaran, kotak
  bulat, dll.) — zona aman sesungguhnya lingkaran berdiameter 80% sisi
  kanvas, tapi kotak yang muat di lingkaran itu cuma 58% (diagonal kotak
  58% ≈ diagonal lingkaran 80%, dengan sedikit sisa aman di empat sudut).

### 4.5 🪤 Dua jebakan yang sudah pernah membuat app tidak bisa dipasang

Dua-duanya sudah tercatat & difix, tapi pola kesalahannya bisa terulang di
route lain yang mirip:

1. **Manifest ter-*prerender* statis walau membaca Prisma.** Next.js bisa
   memutuskan sebuah route boleh di-generate sekali saat build kalau tidak
   ada sinyal eksplisit bahwa isinya harus dinamis — bahkan kalau route itu
   memanggil database. Manifest yang beku berarti ikon yang baru diunggah
   admin tidak pernah sampai ke HP siapa pun. **Solusi & cara deteksi**:
   `export const dynamic = "force-dynamic"` + selalu cek simbol `○` vs `ƒ`
   di output `npm run build` setelah menambah logic baca-DB ke route
   manapun (detail umum di `docs/06-TROUBLESHOOTING-DEPLOY.md` §3.14).
2. **Manifest admin kena gerbang admin+2FA, padahal browser mengambilnya
   tanpa cookie sama sekali** (`credentials: "omit"`). Kalau ikut digerbang,
   yang diterima browser adalah pengalihan ke `/login`, dan app admin
   **mustahil terpasang** — bukan pesan error, cuma tombol "Add to Home
   Screen" yang seolah tidak berfungsi. Dikecualikan eksplisit di
   `proxy.ts` (`isAdminManifest`), lihat `docs/01-ARSITEKTUR.md` §5.4.

---

## Cheat Sheet — Reseller, RBAC, Modal/Laba & PWA

| Saya mau... | Baca file ini |
|---|---|
| Ubah aturan kredit upgrade paket | `web/src/lib/reseller/upgrade.ts` — `quoteUpgrade()` |
| Ubah potongan flat produk manual | `web/src/lib/pricing/effective-price.ts` |
| Ubah 9 izin RBAC atau peta route admin | `docs/03-BACKEND-API.md` §5.3 (referensi lengkap) |
| Ubah cara karyawan diangkat/dicabut | `web/src/app/actions/staff.ts` |
| Ubah cara modal dicatat per order | `web/src/lib/order/cost-snapshot.ts` |
| Ubah angka dashboard/analytics | `web/src/lib/reports/overview.ts` — SATU sumber untuk keduanya |
| Ubah ikon/splash PWA | `web/src/lib/pwa/icon-builder.ts` (ikon), `web/src/lib/pwa/splash.ts` (splash) |
| Tambah perangkat iOS baru ke daftar splash | `IOS_DEVICES` di `web/src/lib/pwa/splash.ts` |
| Debug app admin tidak bisa dipasang | Cek `isAdminManifest` di `proxy.ts` + simbol `○`/`ƒ` di build, lihat §4.5 |
