# Template Pertanyaan untuk CS OkeConnect / OrderKuota

Tinggal salin blok di bawah dan kirim apa adanya. Sudah diurutkan dari yang paling
menentukan. Kalau CS-nya balas singkat-singkat, kirim **bagian A dulu** — tiga
pertanyaan itu yang benar-benar memblokir, sisanya bisa menyusul.

Latar tiap pertanyaan ada di bagian bawah dokumen ini (jangan ikut dikirim) —
supaya kalau CS balas dengan jawaban yang ambigu, kamu tahu mana yang masih kurang.

---

## A. Yang memblokir (kirim ini dulu)

> Halo, saya Wildan dari DannShop, User ID **OK307834**. Saya sedang integrasi H2H
> lewat API Transaksi (h2h.okeconnect.com/trx). Ada beberapa hal teknis yang belum
> saya temukan di dokumentasi Postman, mohon dibantu:
>
> **1. Batas format `refID`**
> Berapa panjang maksimum `refID` yang diterima, dan karakter apa saja yang boleh
> dipakai? Apakah boleh huruf dan tanda hubung, misalnya `FUL-20260814123045-AB12CD`?
> Kalau `refID` yang saya kirim melebihi batas, apakah ditolak dengan pesan error,
> atau dipotong diam-diam oleh sistem?
>
> **2. IP pengirim callback**
> Callback dikirim dari IP mana saja? Saya ingin membatasi endpoint callback saya
> supaya hanya menerima dari IP resmi OkeConnect. Apakah selalu dari
> **103.139.245.61**, atau ada IP lain?
>
> **3. Format `dest` untuk produk game 2 input**
> Untuk produk seperti Mobile Legends (kode `DML12`, `DML86`, dst) yang butuh
> User ID **dan** Zone ID, bagaimana format penulisan `dest` yang benar? Digabung
> langsung tanpa pemisah (`1234567891234`), atau pakai pemisah tertentu?
> Kalau bisa, mohon contoh satu request lengkap untuk `DML12`.

---

## B. Menyusul (kirim setelah A dijawab)

> **4. Retry callback**
> Kalau server saya tidak membalas HTTP 200 (misal sedang down sesaat), apakah
> callback dikirim ulang? Berapa kali dan dengan jeda berapa lama?
>
> **5. Verifikasi keaslian callback**
> Callback yang saya lihat di dokumentasi hanya berisi `refid` dan `message`, tanpa
> signature atau secret. Apakah ada mekanisme verifikasi yang belum terdokumentasi
> (misal token di URL, header khusus, atau HMAC)? Kalau tidak ada, apakah ada
> rencana menambahkannya?
>
> **6. Rate limit**
> Apakah ada batas jumlah request per menit untuk endpoint `/trx`, `/trx/balance`,
> dan halaman daftar harga JSON? Apa yang terjadi kalau terlampaui?
>
> **7. Cek status transaksi lama**
> Endpoint `check=1` bisa menelusuri transaksi sampai berapa lama ke belakang?
> Saya lihat responsnya menyebut tanggal, jadi saya ingin tahu apakah ada batas hari.
>
> **8. Produk cek ID (`CEKML`, `CEKFF`, `CEKAOV`, dst)**
> Bagaimana cara memakai produk cek nama pengguna ini lewat API? Apakah lewat
> endpoint `/trx` yang sama dengan `product=CEKML`? Nama pengguna dikembalikan di
> bagian mana dari response? Beberapa di antaranya berstatus non-aktif di daftar
> harga saya — apakah bisa diaktifkan?
>
> **9. Produk tagihan/pascabayar**
> Untuk produk seperti `BPLA` (Bayar Tagihan Listrik) dan `BBPJS`, di dokumentasi
> tidak ada endpoint inquiry. Bagaimana alur yang benar untuk mengecek nominal
> tagihan sebelum membayar? Apakah ada endpoint terpisah yang belum terdokumentasi?
>
> **10. Daftar harga JSON**
> Saya memakai `okeconnect.com/harga/json?id=905ccd028329b0a` untuk sinkronisasi
> harga otomatis. Apakah endpoint ini resmi dan stabil untuk dipakai jangka panjang?
> Apakah token `id` itu tetap, atau bisa berubah sewaktu-waktu?

---

## Catatan internal (JANGAN ikut dikirim ke CS)

**Kenapa #1 paling genting.** `refID` adalah satu-satunya kunci idempotency kita.
Semua contoh di dokumentasi OkeConnect memakai angka pendek (`114`, `999`, `7777`),
sementara `generateRefId` kita menghasilkan `FUL-20260814123045-AB12CD`. Kalau
OkeConnect memotongnya diam-diam, gejalanya **bukan** error yang kelihatan —
cek status berikutnya tidak akan pernah cocok, dan itu bisa berujung kirim dua kali.
Adapter sudah memasang penjaga (kalau provider memantulkan `R#` yang berbeda dari
yang kita kirim, ketidakcocokan itu ditulis ke pesan dan tercatat di ProviderApiLog),
tapi itu **deteksi, bukan pencegahan**. Jawaban CS yang dibutuhkan: angka
maksimum yang jelas, bukan "bebas saja".

**Kenapa #2 penting.** Callback OkeConnect tidak punya signature sama sekali, jadi
siapa pun yang tahu URL callback kita bisa mengarang `message` berisi "SUKSES".
Mitigasi utama kita tidak bergantung pada jawaban ini (callback cuma dipakai sebagai
pemicu; keputusan status selalu diambil dari `check=1`), tapi filter IP menutup
permukaan serangannya. `103.139.245.61` sudah dikonfirmasi sebagai IP
`h2h.okeconnect.com` lewat DNS — yang belum pasti, apakah callback benar-benar
berasal dari IP yang sama. **Jangan pasang filter IP sebagai pemblokir sebelum CS
menjawab** — kalau IP-nya ternyata beda, callback sah akan terbuang diam-diam.

**Kenapa #3 perlu ditanya walau kelihatan sepele.** Digiflazz punya kelas masalah
yang sama (`docs/04-INTEGRASI-PAYMENT-PPOB.md` §3.3 menyebut format `customer_no`
berbeda per kategori). Menebak format lalu salah bukan menghasilkan error, melainkan
**kirim ke akun orang lain** — uang hilang tanpa bisa ditarik.

**#9 sudah diputuskan ditunda** (butuh alur order harga-variabel yang belum ada di
DannShop), tapi tetap ditanyakan sekarang supaya jawabannya sudah di tangan saat
fase itu digarap.

**#10** jawabannya sudah kita tahu secara empiris (token sama untuk semua member,
sudah diverifikasi), tapi konfirmasi tertulis dari CS berguna kalau suatu saat
endpoint itu berubah tanpa pemberitahuan.
