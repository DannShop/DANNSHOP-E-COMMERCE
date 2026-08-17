# 12 — Build App Android (TWA) dari PWA

Panduan lengkap mengubah PWA DannShop jadi aplikasi Android asli (`.apk` untuk
dibagikan langsung, `.aab` untuk Play Store). Ditulis langkah demi langkah
karena sebagian besar prosesnya terjadi di **luar** repo ini dan beberapa
keputusannya **permanen**.

> **Yang dikerjakan Claude vs kamu:** sisi kode (route `assetlinks.json`,
> pengecualian `proxy.ts`, env) sudah selesai. Sisanya di dokumen ini kamu yang
> jalankan — butuh Java, keystore, dan keputusan nama paket yang tidak bisa
> diubah setelah rilis.

---

## 0. Apa yang sebenarnya dibangun

**TWA (Trusted Web Activity)** = Chrome asli tanpa address bar yang membuka
situs kamu, dibungkus jadi app Android. Bukan WebView jadul, bukan hybrid.

Konsekuensi yang perlu dipahami sejak awal:

| | Artinya |
|---|---|
| ✅ Update situs = update app | Ganti harga, tambah produk, perbaiki bug — langsung sampai ke app tanpa rilis ulang APK |
| ✅ Satu kode untuk semua | Tidak ada codebase Android terpisah yang harus ikut dirawat |
| ⚠️ Butuh internet | Di luar halaman `/offline`, app kosong tanpa koneksi — sama seperti membuka situsnya |
| ⚠️ Rilis ulang APK hanya kalau | Ganti ikon app, nama app, atau `package_name` |

**Yang WAJIB diverifikasi Chrome**: `https://domainmu.com/.well-known/assetlinks.json`
harus memuat sidik jari sertifikat APK kamu. Kalau tidak cocok, app tetap jalan
**tapi menampilkan address bar Chrome di atas layar** — dan itu satu-satunya
gejalanya, tidak ada pesan error apa pun.

---

## 1. Prasyarat

| Yang dibutuhkan | Versi | Catatan |
|---|---|---|
| Node.js | 14.15.0+ | Sudah ada (dipakai project ini) |
| **JDK** | **persis 17** | 🔴 Bukan 21, bukan 11. Versi lain gagal compile |
| Android Command Line Tools | terbaru | Bubblewrap bisa mengunduhkan sendiri |

### Cek & pasang JDK 17 (Windows)

```powershell
java -version
```

Kalau belum ada atau bukan 17, pasang **Eclipse Temurin JDK 17**
(<https://adoptium.net/temurin/releases/?version=17>) — pilih installer `.msi`
untuk Windows x64, dan centang opsi *"Set JAVA_HOME variable"* saat instalasi.

Tutup lalu buka ulang PowerShell, verifikasi:

```powershell
java -version
# harus menampilkan: openjdk version "17.x.x"
```

---

## 2. Pasang Bubblewrap & cek lingkungan

```powershell
npm i -g @bubblewrap/cli
bubblewrap doctor
```

`doctor` memvalidasi JDK & Android SDK. **Jangan lanjut sebelum ia bersih** —
error di tahap ini jauh lebih mudah dibaca daripada error saat build.

Kalau Android SDK belum ada, Bubblewrap akan menawarkan mengunduhnya saat
`init` pertama. Jawab **yes** dan biarkan selesai (unduhannya ratusan MB).

---

## 3. Cek PWA-nya layak jadi TWA

```powershell
bubblewrap validate --url https://domainmu.com
```

Ganti `domainmu.com` dengan domain produksi asli. Ini memeriksa manifest,
service worker, dan ikon. Semua sudah disiapkan di sisi kode, jadi seharusnya
lolos — kalau ada yang merah, kabari Claude, itu urusan kode.

---

## 4. `bubblewrap init` — bagian yang butuh ketelitian

Buat folder KOSONG di luar repo (jangan di dalam `web/`, supaya artefak build
tidak ikut ter-commit):

```powershell
mkdir D:\dannshop-android
cd D:\dannshop-android
bubblewrap init --manifest https://domainmu.com/manifest.webmanifest
```

> Perhatikan: yang dipakai `manifest.webmanifest` (app **Toko**). App admin
> punya manifest sendiri di `/admin/app.webmanifest` — jangan dipakai di sini
> kecuali kamu memang mau app admin terpisah (lihat §10).

Bubblewrap akan bertanya berurutan. Ini jawaban yang benar untuk kasus kita:

| Pertanyaan | Jawaban | Kenapa |
|---|---|---|
| Domain being opened in the TWA | `domainmu.com` | Tanpa `https://`, tanpa slash |
| Name of the application | Nama toko kamu | Ikut dari manifest, tinggal Enter |
| Short name | maks 12 karakter | Yang muncul di bawah ikon home screen |
| **Application ID** | `com.namatokomu.app` | 🔴 **PERMANEN** — baca peringatan di bawah |
| Display mode | `standalone` | Sesuai manifest |
| Orientation | `any` | Jangan dikunci — panel admin butuh lanskap |
| Status bar color | ikut manifest | Tinggal Enter |
| Splash screen color | ikut manifest | ⚠️ Kalau masih putih, benerin dulu di `/admin/mobile-app` |
| Icon URL / Maskable icon URL | ikut manifest | Sudah ada dua-duanya |
| Monochrome icon URL | boleh kosong | Untuk themed icon Android 13+, opsional |
| Include support for Play Billing? | **No** | 🔴 Ini mengaktifkan Google Play Billing. Kamu pakai Midtrans — jawab **No** |
| Request geolocation permission? | **No** | Tidak dipakai, dan izin yang tak terpakai bikin app terlihat mencurigakan |
| Key store location | Enter (default) | Membuat `android.keystore` baru di folder ini |
| Key name | `android` | Default, catat saja |
| Password keystore & key | **buat password kuat, CATAT** | 🔴 Baca peringatan di bawah |

### 🔴 Dua keputusan yang tidak bisa dibatalkan

**1. Application ID (nama paket)**

Format: huruf kecil, dipisah titik, mis. `com.dannshop.app`. Ini identitas app
di Android dan Play Store. **Setelah app rilis, ini tidak bisa diganti selamanya**
— mengubahnya berarti app yang lama dianggap aplikasi berbeda, dan pengguna
lama tidak akan pernah menerima pembaruan. Pilih yang kamu tidak akan sesali.
Jangan pakai `com.example.*`, Play Store menolaknya.

**2. Keystore (`android.keystore`) + passwordnya**

Berkas ini yang menandatangani APK. **Kalau hilang atau passwordnya lupa, kamu
tidak akan pernah bisa merilis pembaruan** untuk app yang sudah terpasang —
satu-satunya jalan adalah menerbitkan app baru dengan package name berbeda,
dan pengguna lama harus memasang ulang dari nol.

Segera setelah `init` selesai:
- Salin `android.keystore` ke **minimal dua tempat** di luar laptop (Google
  Drive, hard disk eksternal — bukan cuma folder Downloads)
- Simpan passwordnya di password manager, bukan di catatan yang sama dengan file-nya
- 🔴 **Jangan pernah commit ke Git.** Folder `D:\dannshop-android` sengaja di luar repo

---

## 5. Build

```powershell
bubblewrap build
```

Selesai dalam beberapa menit. Hasilnya dua berkas:

| Berkas | Untuk apa |
|---|---|
| `app-release-signed.apk` | Dipasang langsung ke HP (sideload). **Ini yang kamu pakai sekarang** |
| `app-release-bundle.aab` | Upload ke Play Store. Simpan untuk nanti |

---

## 6. Ambil sidik jari (SHA-256 fingerprint)

Cara paling langsung — Bubblewrap membuatkan isi `assetlinks.json` sekaligus:

```powershell
bubblewrap fingerprint generateAssetLinks
```

Atau lihat daftarnya:

```powershell
bubblewrap fingerprint list
```

Kalau dua-duanya bermasalah, ambil manual dari keystore pakai `keytool` bawaan
JDK (ganti `android` kalau key name-mu berbeda):

```powershell
keytool -list -v -keystore android.keystore -alias android
```

Cari baris yang diawali **`SHA256:`**. Bentuknya 32 pasang hex dipisah titik
dua:

```
SHA256: 14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5
```

**Salin bagian setelah `SHA256:` saja**, tanpa spasi di awal.

---

## 7. Pasang env di Vercel

Vercel Dashboard → project → **Settings → Environment Variables**, scope
**Production**:

| Name | Value |
|---|---|
| `TWA_PACKAGE_NAME` | Application ID dari §4, mis. `com.dannshop.app` |
| `TWA_SHA256_FINGERPRINTS` | Sidik jari dari §6 |

> 🔴 **Setelah menyimpan env, WAJIB redeploy.** Env baru tidak berlaku untuk
> deployment yang sudah jalan. Vercel → Deployments → titik tiga pada deployment
> teratas → **Redeploy**.

Kalau nanti pakai Play App Signing (§9), kamu akan punya **dua** sidik jari —
punyamu dan punya Google. Isi keduanya, dipisah koma:

```
14:6D:...:E5,A1:B2:...:99
```

---

## 8. Verifikasi & pasang

### 8a. Pastikan assetlinks sudah live

Buka di browser: `https://domainmu.com/.well-known/assetlinks.json`

Harus muncul JSON berisi `package_name` dan `sha256_cert_fingerprints` kamu.

- **404** → env belum keisi, atau belum redeploy (§7)
- **Halaman maintenance** → seharusnya tidak mungkin, route ini sudah
  dikecualikan di `proxy.ts`. Kalau tetap terjadi, kabari Claude

Google juga menyediakan pemeriksa resmi:

```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://domainmu.com&relation=delegate_permission/common.handle_all_urls
```

### 8b. Pasang ke HP

Kirim `app-release-signed.apk` ke HP (WA/Drive/kabel), lalu buka berkasnya.
Android akan minta izin *"Install unknown apps"* — wajar untuk sideload.

Atau lewat kabel USB dengan USB debugging aktif:

```powershell
bubblewrap install
```

### 8c. Tes yang menentukan berhasil/tidak

Buka app-nya. **Kalau tidak ada address bar Chrome di atas → berhasil.**

Kalau address bar muncul:
1. Cek `assetlinks.json` benar-benar bisa dibuka (§8a)
2. Pastikan sidik jarinya cocok persis dengan APK yang kamu pasang
3. **Hapus app, pasang ulang** — verifikasi terjadi saat instalasi, jadi app
   yang dipasang sebelum env-nya benar akan tetap salah

---

## 9. Update app nanti

### 9a. Yang TIDAK perlu build ulang (95% pekerjaan sehari-hari)

Deploy web seperti biasa — app otomatis ikut berubah, tanpa user perlu
memperbarui apa pun:

- Harga, produk, kategori, stok
- Fitur baru, halaman baru, perbaikan bug
- Banner, tema, warna storefront, konten FAQ/TOS/Privasi
- Apa pun yang berubah lewat panel admin selain §9b

### 9b. Yang PERLU build ulang — hanya 4 hal

Keempatnya "dibekukan" ke dalam APK saat build, jadi Android tidak membacanya
ulang dari web:

- Ikon app (yang tampil di home screen)
- Nama app / nama pendek
- Warna splash (`background_color` / `theme_color`)
- Shortcut (menu tekan-lama pada ikon)

**Caranya: klik dua kali `D:\dannshop-android\BUILD-ULANG.bat`.**

Script itu menaikkan nomor versi, menarik ikon & pengaturan terbaru dari web,
compile, menandatangani APK **dan** AAB, lalu memverifikasi hasilnya. Tidak ada
perintah yang perlu dihafal.

> 🔴 **Jangan pakai `bubblewrap build` langsung di mesin Windows dengan JDK di
> `C:\Program Files`.** Bubblewrap tidak membungkus path Java yang mengandung
> spasi dengan tanda kutip, jadi tahap penandatanganan selalu gagal dengan
> `'C:\Program' is not recognized`. Gradle-nya sendiri berhasil — yang gagal
> hanya langkah terakhir, sehingga mudah dikira build-nya rusak total padahal
> APK-nya sudah jadi (tinggal belum ditandatangani). Script di atas
> menandatangani manual dengan quoting yang benar, dan itu sebabnya ia ada.

Kalau tetap ingin manual, urutan yang benar-benar bekerja:

```powershell
cd D:\dannshop-android
bubblewrap update --skipVersionUpgrade
.\gradlew.bat assembleRelease
# zipalign DULU, baru tanda tangan - mengubah apa pun setelah tanda tangan
# akan membatalkan tanda tangannya
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.1.0\zipalign.exe" -p -f 4 `
  app\build\outputs\apk\release\app-release-unsigned.apk app-release-unsigned-aligned.apk
& "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.8-hotspot\bin\java.exe" -jar `
  "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.1.0\lib\apksigner.jar" sign `
  --ks android.keystore --ks-key-alias android `
  --ks-pass "pass:PASSWORD-KEYSTORE" --key-pass "pass:PASSWORD-KEYSTORE" `
  --out app-release-signed.apk app-release-unsigned-aligned.apk
```

> ⚠️ `.\gradlew.bat`, bukan `gradlew.bat`. Pada mesin dengan
> `NoDefaultCurrentDirectoryInExePath` aktif, `cmd.exe` tidak mencari folder
> yang sedang aktif, sehingga `gradlew.bat` dilaporkan "is not recognized"
> padahal berkasnya jelas ada di situ.

### 9c. Setelah build ulang

- **Fingerprint tidak berubah** (keystore-nya sama), jadi env di Vercel **tidak
  perlu disentuh** dan tidak perlu redeploy.
- Di HP: **hapus app lama dulu, baru pasang yang baru.** Android menolak
  memasang APK di atas versi lama kalau tanda tangannya dianggap berbeda.
- Untuk Play Store: upload `app-release-bundle.aab` yang baru. `versionCode`
  wajib lebih tinggi dari yang sudah pernah diupload — script menaikkannya
  otomatis.

---

## 10. Kalau nanti mau ke Play Store

Ini opsional dan bisa ditunda selamanya — sideload `.apk` sudah cukup untuk
dibagikan ke pelanggan lewat link.

### Yang perlu disiapkan

- Akun Play Console, biaya pendaftaran **$25 sekali seumur hidup**
- Upload `app-release-bundle.aab` (bukan `.apk`)
- **Play App Signing**: Google akan menandatangani ulang app-mu dengan key
  miliknya → muncul sidik jari **kedua** yang wajib ditambahkan ke
  `TWA_SHA256_FINGERPRINTS` (§7). Lewatkan ini dan app dari Play Store akan
  menampilkan address bar walau versi sideload-mu normal
- Akun **personal** (bukan organisasi) wajib punya 20 tester aktif selama 14
  hari sebelum boleh rilis publik. Akun organisasi bebas syarat ini

### 🔴 Risiko yang harus kamu putuskan sendiri: Google Play Billing

Google mewajibkan pembayaran lewat sistem mereka (potongan **15–30%**) untuk
"digital goods yang dikonsumsi di dalam app". Posisi PPOB **abu-abu**:

- **Argumen bahwa kita aman:** barangnya dikonsumsi di *luar* app — diamond
  masuk ke akun game pihak ketiga, pulsa ke kartu SIM, token ke meteran PLN.
  Secara kategori lebih dekat ke voucher/layanan daripada konten in-app.
- **Risikonya:** Google bisa menilai top-up game sebagai digital goods, dan
  akibatnya app ditolak atau ditakedown — bukan sekadar disuruh revisi.

Banyak app PPOB Indonesia hidup di Play Store dengan payment gateway sendiri,
jadi presedennya ada. **Tapi ini tidak bisa dijamin** — kebijakan Google berubah
dan penegakannya tidak konsisten. Ini keputusan bisnis, bukan teknis.

**Saran urutan:** sideload dulu → kalau sudah ramai dan stabil, coba Internal
Testing di Play Console (tidak publik) → baru pertimbangkan rilis publik.

### App admin sebagai TWA terpisah?

Bisa (ulangi §4 dengan `--manifest https://domainmu.com/admin/app.webmanifest`
dan Application ID berbeda, mis. `com.dannshop.admin`), lalu tambahkan sidik
jarinya ke `TWA_SHA256_FINGERPRINTS` dengan **package name berbeda** — ini
butuh perubahan kecil di route `assetlinks.json` karena sekarang hanya
mendukung satu package. Kabari Claude kalau memang mau.

Tapi pertimbangkan dulu: panel admin sudah bisa dipasang sebagai PWA dari
Chrome (`/admin` → menu → Install), dan itu sudah memberi ikon home screen
tanpa perlu APK sama sekali.

---

## 11. Troubleshooting

| Gejala | Penyebab & solusi |
|---|---|
| **Address bar Chrome muncul di app** | Verifikasi Digital Asset Links gagal. Lihat §8c |
| `bubblewrap doctor` error JDK | JDK bukan versi 17. Pasang Temurin 17, buka ulang terminal |
| Build gagal, error Gradle/SDK | Hapus folder `.bubblewrap` di home directory, jalankan `bubblewrap doctor` lagi |
| `assetlinks.json` balas 404 | Env `TWA_PACKAGE_NAME`/`TWA_SHA256_FINGERPRINTS` kosong atau salah format. Route sengaja fail-closed |
| Sidik jari terlihat benar tapi tetap gagal | Formatnya harus hex uppercase dipisah titik dua. Yang salah format **diabaikan diam-diam** oleh validator |
| App dari Play Store ada address bar, versi sideload normal | Play App Signing menambah sidik jari kedua. Tambahkan ke env (§9) |
| Splash screen ada "2 tahap" | Warna latar app ≠ warna splash. Benerin di `/admin/mobile-app`, lalu **hapus app & pasang ulang** — Android mengunci `background_color` saat instalasi |

---

## Cheat Sheet

| Saya mau... | Perintah / lokasi |
|---|---|
| Cek lingkungan siap | `bubblewrap doctor` |
| Cek PWA layak | `bubblewrap validate --url https://domainmu.com` |
| Bikin project TWA | `bubblewrap init --manifest https://domainmu.com/manifest.webmanifest` |
| Build APK + AAB | `bubblewrap build` |
| Lihat sidik jari | `bubblewrap fingerprint list` atau `keytool -list -v -keystore android.keystore -alias android` |
| Pasang ke HP via USB | `bubblewrap install` |
| Update setelah ganti ikon/nama | `bubblewrap update` lalu `bubblewrap build` |
| Ubah warna splash/ikon | Panel `/admin/mobile-app` — **bukan** di project Android |
| Cek assetlinks live | `https://domainmu.com/.well-known/assetlinks.json` |
| Sisi kode assetlinks | `web/src/app/.well-known/assetlinks.json/route.ts` |
