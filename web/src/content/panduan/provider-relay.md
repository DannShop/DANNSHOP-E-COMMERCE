# Provider & Relay IP Tetap

Panduan operasional sisi pengiriman barang: menghubungkan Digiflazz dan
OkeConnect, membaca penolakan mereka, dan menjaga relay ber-IP tetap tetap hidup.

Pengaturannya ada di **Providers**, dan jejaknya di **Log API Provider**.

---

## Kenapa harus ada relay

Kedua provider menolak permintaan dari IP yang tidak terdaftar di whitelist mereka.
Aplikasi ini berjalan di Vercel, yang **tidak punya IP keluar tetap** — tiap
pemanggilan bisa keluar dari alamat mana saja. Jadi mendaftarkan IP Vercel hari ini
dijamin gagal lagi besok.

Solusinya bukan di kode: satu file PHP kecil di shared hosting (yang IP-nya tetap)
meneruskan permintaan kita ke provider. Cukup **IP hosting itu** yang didaftarkan,
sekali.

```
Vercel (IP berganti-ganti) → relay (IP TETAP) → provider
                                ^ ini yang didaftarkan
```

> **Price list OkeConnect tidak lewat relay.** Host-nya berbeda dari host transaksi
> dan tidak butuh whitelist sama sekali. Jadi **Sync Harga bisa berhasil walaupun
> urusan IP masih bermasalah** — dua hal yang terpisah, jangan saling ditunggu.

---

## Mencari tahu IP keluar relay

Jangan menebak dari alamat web hosting — banyak shared hosting keluar lewat alamat
yang berbeda dari alamat yang menerima permintaan web. Tanyakan langsung ke relaynya:

```
curl -H "x-relay-secret: <SECRET>" "<PROVIDER_RELAY_URL>?ping=1"
```

```json
{ "ok": true, "ip_keluar": "202.10.43.174", "server_addr": "202.10.43.175" }
```

Yang didaftarkan adalah **`ip_keluar`**, bukan `server_addr`. Keduanya sering
berbeda, dan salah pilih menghasilkan gejala yang persis sama dengan belum
mendaftar sama sekali.

Shared hosting bisa punya lebih dari satu alamat keluar. Kalau kolom whitelist
provider mengizinkan banyak IP, **tambahkan**, jangan mengganti yang sudah ada.

---

## Membaca penolakan provider

| Pesan | Artinya | Yang diperbaiki |
|---|---|---|
| `IP tidak sesuai @<ip>` (OkeConnect) | IP itu belum terdaftar | Daftarkan alamat itu persis, digit demi digit |
| `rc 45` / "IP Anda tidak kami kenali" (Digiflazz) | Sama, versi Digiflazz | Sama |
| `Pin Salah` / `Password Salah` | Kredensial | Isi ulang di Providers |
| `Pengguna tidak ditemukan` | User ID salah | Cek User ID di dashboard provider |
| `Host tujuan tidak diizinkan` | Ini pesan **relay**, bukan provider | Host tujuan belum ada di daftar izin relay |
| `Relay membalas bukan JSON` | Relay mati / file salah pasang | Cek URL relay & file di hosting |

### Urutan gerbang OkeConnect

Diverifikasi lewat percobaan langsung: **User ID → PIN → IP.** Konsekuensinya
sangat berguna saat menebak sebab:

> Begitu pesannya `IP tidak sesuai`, **User ID dan PIN kamu sudah pasti benar.**
> Berhenti mencurigai kredensial — yang tersisa hanya whitelist IP.

---

## Kalau IP sudah didaftarkan tapi tetap ditolak

1. Muat ulang halaman whitelist provider di **jendela incognito**. Form yang
   terisi karena autofill browser bisa terlihat tersimpan padahal tidak.
2. Kalau form itu punya kolom Password, **isi ulang juga** — form seperti itu
   sering menolak menyimpan diam-diam tanpa password.
3. Coba isi **satu IP saja** tanpa koma dan tanpa spasi. Kalau berhasil, berarti
   pemisah daftarnya yang bermasalah, bukan alamatnya.
4. Kalau tetap ditolak, tanyakan ke CS provider apakah ada langkah persetujuan
   atau jeda propagasi.

---

## Perawatan rutin

**Cek Saldo** — tombol di halaman Providers. Ini operasi paling tidak berbahaya
untuk membuktikan kredensial dan whitelist sudah benar, karena hanya membaca.
Atur juga **ambang alert saldo** supaya notifikasi Telegram terkirim otomatis
sebelum saldo habis di tengah jam ramai.

**Sync Harga** — menarik price list terbaru ke salinan lokal. Berjalan otomatis
tiap 3 jam lewat job, dan bisa dipicu manual. Yang diperbarui hanya harga
**modal**; harga jual yang sudah kamu atur tidak pernah ditimpa.

**Rotasi secret relay** — kalau `RELAY_SECRET` pernah bocor, ganti di **dua tempat
sekaligus**: file relay di hosting dan `PROVIDER_RELAY_SECRET` di Vercel. Harus
sama persis; kalau meleset, seluruh jalur transaksi mati.

---

## Kalau ada yang gagal, lihat di mana

- **Log API Provider** — tiap panggilan keluar beserta balasan mentah provider dan
  apakah lewat relay atau tidak. Kolom itu penting: kegagalan IP artinya berbeda
  tergantung jalurnya.
- **Log Callback** — pemberitahuan masuk dari provider.
- **Monitoring Job** — `sync-prices` dan `recheck-fulfillment`. Job yang menumpuk
  gagal di sini berarti ada yang perlu dibaca error-nya, bukan diulang saja.

---

## Terkait

- **Tambah Produk** — setelah provider hidup, ini langkah berikutnya.
- Pemasangan relay dari nol ada di repo: `docs/08-IP-TETAP-DIGIFLAZZ.md`.
- Riset lengkap OkeConnect: `docs/providers/okeconnect.md`.
