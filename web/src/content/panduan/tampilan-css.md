# Tampilan & Tema — CSS Kustom dan Slot HTML

Halaman **Tampilan & Tema** (`/admin/appearance`) punya empat alat, dari yang paling aman ke yang paling bebas:

| Alat | Untuk apa | Risiko salah |
|---|---|---|
| Warna utama | Mengganti warna tombol & aksen di seluruh toko | Nol |
| Radius sudut | Melengkungkan sudut kartu & tombol | Nol |
| **Slot HTML** | Menyisipkan tulisan/gambar di titik tertentu | Kecil — terbatas pada slotnya |
| **CSS kustom** | Mengubah tampilan apa pun di storefront | **Besar — bisa merusak seluruh halaman** |

---

## 1. Yang wajib diketahui sebelum menyentuh CSS kustom

### CSS kustom TIDAK dipasang di panel admin

Ini disengaja, dan menyelamatkanmu. CSS kustom hanya dimuat di **halaman storefront publik**, tidak pernah di `/admin`.

Alasannya: satu aturan salah ketik seperti

```css
div { display: none }
```

akan menyembunyikan seluruh isi halaman. Kalau CSS itu ikut termuat di panel admin, kamu tidak punya cara membuka halaman Tampilan & Tema untuk membatalkannya — satu-satunya jalan keluar adalah mengedit database langsung.

Karena dipisah, **kesalahan CSS selalu bisa dibatalkan**: panelnya tetap hidup apa pun yang kamu tulis.

### Kalau storefront terlanjur rusak

1. Buka `/admin/appearance` (panel tetap normal, apa pun isi CSS-mu)
2. Kosongkan kotak CSS kustom
3. Simpan

Selesai. Tidak perlu deploy, tidak perlu menyentuh database.

---

## 2. Yang otomatis dibuang dari CSS-mu

CSS kustom disaring sebelum disimpan. Empat hal ini **dibuang diam-diam** — kalau kamu menulisnya lalu hilang, itu bukan bug:

| Ditulis | Jadi | Kenapa dibuang |
|---|---|---|
| `@import url(...)` | dihapus | Memuat stylesheet dari server lain — kalau server itu diretas, halaman pembayaranmu ikut berubah |
| `url(https://...)` | `none` | Sekadar memuat gambar latar sudah memberi tahu server luar siapa saja yang membuka tokomu |
| `expression(...)` | dihapus | Bisa menjalankan kode di mesin browser lama |
| `<style>` / `<script>` | dihapus | Mencegah CSS keluar dari elemennya sendiri |

**`url()` dengan gambar data tetap boleh:**

```css
/* ✅ boleh — gambar ditempel langsung, tidak memanggil server luar */
.hero { background-image: url(data:image/svg+xml;base64,PHN2Zy...); }

/* ❌ jadi `none` */
.hero { background-image: url(https://contoh.com/latar.jpg); }
```

Untuk gambar dari luar, pakai **slot HTML** dengan tag `<img src="https://...">` — jalur itu memang mengizinkannya.

Batas panjang CSS: **20.000 karakter**.

---

## 3. Kelas yang aman dijadikan sasaran

Selector CSS-mu bebas, tapi sebagian besar kelas di halaman ini dihasilkan Tailwind dan **bisa berubah kapan saja saat aplikasi diperbarui**. Menyasarnya berarti tampilanmu diam-diam rusak setelah update.

Kelas berikut ditulis tangan dan **stabil** — aman dijadikan pegangan:

| Kelas | Di mana |
|---|---|
| `.receipt-sheet` | Lembar struk yang dicetak |
| `.auth-brand` | Panel bergradasi di halaman login & daftar |
| `.glass-card` | Kartu material kaca |
| `.glass-panel` | Sidebar & header material kaca |

Selain itu, cara paling aman menyasar sesuatu adalah **memberinya kelasmu sendiri lewat slot HTML**, lalu menata kelas itu:

```html
<!-- Slot: Detail produk — bawah -->
<div class="catatan-toko">Pesanan diproses otomatis 24 jam.</div>
```

```css
/* CSS kustom */
.catatan-toko {
  border-left: 3px solid var(--primary);
  padding: 12px 16px;
  background: rgba(124, 58, 237, 0.06);
  border-radius: 10px;
}
```

Kelas `.catatan-toko` milikmu sendiri — tidak akan pernah berubah karena update.

### Variabel warna yang bisa dipakai

```css
var(--primary)      /* warna utama (ikut pilihanmu di Warna utama) */
var(--background)   /* latar halaman */
var(--foreground)   /* warna teks */
var(--muted-foreground)  /* teks abu-abu */
var(--border)       /* garis pembatas */
var(--radius)       /* radius sudut (ikut pilihanmu) */
```

Memakai variabel jauh lebih baik daripada menulis hex sendiri: ia otomatis benar di **mode gelap maupun terang**, sementara hex tetap sama dan bisa jadi tidak terbaca.

---

## 4. Mode gelap

Toko ini punya mode gelap. Kalau kamu menulis warna sendiri, tulis dua-duanya:

```css
.catatan-toko {
  background: #f4f0ff;
  color: #1a1a2e;
}

/* Mode gelap: kelas .dark dipasang di elemen <html> */
.dark .catatan-toko {
  background: #1e1b32;
  color: #e8e6f5;
}
```

Kalau lupa, catatanmu akan jadi kotak putih menyilaukan di tengah halaman gelap.

---

## 5. Slot HTML

Slot adalah titik-titik yang sudah disiapkan di halaman untuk menyisipkan HTML-mu. Ada **12 slot**:

| Slot | Muncul di mana |
|---|---|
| Beranda — atas | Di atas banner carousel |
| Beranda — bawah | Di bawah daftar kategori |
| Daftar produk (kategori) | Di atas grid produk halaman kategori |
| Detail produk — atas | Di atas form pemesanan |
| Detail produk — bawah | Di bawah tombol beli — cocok untuk cara pesan / syarat |
| Form checkout | Di dalam form, tepat di atas tombol bayar |
| Halaman transaksi — atas | Di atas kartu status pesanan |
| Halaman transaksi — bawah | Di bawah tombol-tombol invoice |
| Halaman cetak struk | Di atas pratinjau struk — **tidak ikut tercetak** |
| Halaman deposit saldo | Di atas form isi saldo |
| Halaman login | Di bawah form login |
| Halaman pendaftaran | Di bawah form daftar |

### Tag yang diizinkan

```
p br hr span div strong b em i u s small mark
h1 h2 h3 h4 h5 h6
ul ol li blockquote code pre
a img table thead tbody tr th td
```

Tag di luar daftar ini dibuang, **tapi teks di dalamnya tetap dipertahankan** — kalau kamu memakai `<section>`, tulisanmu tidak hilang, cuma pembungkusnya yang lepas.

### Atribut yang diizinkan

| Tag | Atribut |
|---|---|
| Semua | `class`, `style` |
| `<a>` | `href`, `title`, `target` |
| `<img>` | `src`, `alt`, `width`, `height` |

Atribut `on...` (mis. `onclick`) **selalu ditolak**, semuanya sekaligus.

### Aturan tautan & gambar

`href` dan `src` hanya menerima:

```
https://...     ✅
mailto:...      ✅
tel:...         ✅
/halaman        ✅ (tautan ke halaman toko sendiri)
#bagian         ✅
http://...      ❌ ditolak — memicu peringatan "konten tidak aman" di halaman pembayaran
javascript:...  ❌
data:...        ❌
```

`target="_blank"` otomatis diberi `rel="noopener noreferrer nofollow"`. Tanpa itu, halaman tujuan bisa mengalihkan tab tokomu ke halaman phishing setelah pembeli mengkliknya.

### Atribut `style` inline lebih sempit daripada CSS kustom

Di dalam slot HTML, `style="..."` hanya menerima properti tampilan: warna, font, jarak, garis, ukuran, `display`, `opacity`, `border-radius`.

Yang **tidak** diterima: `position`, `z-index`, `transform`, dan sejenisnya — properti itu cukup untuk menutupi tombol bayar dengan elemen palsu yang tampak identik.

Kalau butuh properti itu, pakai **CSS kustom** dengan kelasmu sendiri (bagian 3). CSS kustom memang lebih bebas — dan itulah kenapa ia tidak pernah dimuat di panel admin.

---

## 6. Resep yang sering dipakai

### Pita pengumuman di beranda

```html
<!-- Slot: Beranda — atas -->
<div class="pita-info">🎉 Promo akhir pekan — semua voucher game diskon 5%</div>
```

```css
.pita-info {
  text-align: center;
  padding: 10px 16px;
  border-radius: 10px;
  background: linear-gradient(90deg, #7c3aed, #4f46e5);
  color: #fff;
  font-weight: 600;
}
```

### Daftar cara pesan di halaman produk

```html
<!-- Slot: Detail produk — bawah -->
<div class="cara-pesan">
  <h3>Cara pesan</h3>
  <ol>
    <li>Masukkan User ID &amp; Zone ID</li>
    <li>Pilih nominal</li>
    <li>Pilih metode pembayaran, lalu bayar</li>
    <li>Pesanan diproses otomatis, biasanya di bawah 1 menit</li>
  </ol>
</div>
```

```css
.cara-pesan { margin-top: 20px; }
.cara-pesan h3 { font-weight: 700; margin-bottom: 8px; }
.cara-pesan ol { padding-left: 20px; }
.cara-pesan li { margin-bottom: 4px; }
```

### Menyembunyikan sesuatu

```css
/* Contoh: sembunyikan lencana "Instan" di kartu nominal */
.dark .catatan-toko { /* dst */ }
```

⚠️ Berhati-hatilah dengan `display: none` pada selector yang luas. Uji dulu di satu halaman, jangan langsung menyasar `div` atau `section`.

---

## 7. Urutan menguji yang aman

1. Tulis CSS-mu, **Simpan**
2. Buka storefront di **tab lain** (jangan tutup tab panel admin)
3. Periksa: beranda, satu halaman produk, halaman invoice
4. Periksa juga di **mode gelap** dan di **layar HP**
5. Kalau ada yang rusak, kembali ke tab panel → kosongkan → Simpan

Panel admin tidak akan pernah ikut rusak, jadi langkah 5 selalu tersedia.
