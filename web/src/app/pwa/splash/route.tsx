import { ImageResponse } from "next/og";
import { resolveIcon, type PwaAppKind } from "@/lib/pwa/config";
import { getPwaSettings } from "@/lib/pwa/settings";
import { SPLASH_MAX_SIDE, autoLogoSize, coverSize, pickSplashImage } from "@/lib/pwa/splash";

// Gambar layar pembuka iOS, dibuat sesuai permintaan.
//
// Kenapa dibuat on-demand dan bukan disimpan sebagai berkas: iOS memilih layar
// pembukanya lewat media query yang harus cocok PERSIS dengan ukuran layar
// perangkat, jadi jalur konvensionalnya adalah memproduksi 38 berkas gambar
// (19 perangkat x 2 orientasi) PER APP, lalu memproduksi ulang semuanya setiap
// kali admin mengganti warna atau ikon. Satu route yang menggambar sendiri
// menghapus seluruh kelas pekerjaan itu, dan yang lebih penting: menghapus
// kelas kegagalan di mana admin mengganti gambar tapi 76 berkas lama tetap
// terpasang tanpa satu pun tanda.
//
// Ongkosnya render piksel di server, dan itu dibayar SEKALI per ukuran: URL-nya
// membawa sidik jari `v` dari pengaturan (lihat appearanceVersion), jadi
// hasilnya boleh di-cache selamanya dan tetap berubah begitu admin menyimpan
// pengaturan baru.
//
// ⚠️ Route ini WAJIB ada di daftar `isPwaAsset` di proxy.ts. Kalau tertelan
// rewrite maintenance, iOS menerima HTML sebagai gambar dan layar pembukanya
// kembali kosong.
//
// force-dynamic dengan alasan yang sama seperti kedua manifest: Route Handler
// bisa dibekukan saat build, dan layar pembuka yang dibekukan berarti gambar
// yang diunggah admin tidak pernah sampai ke HP. Cache tetap ada, tapi di CDN
// lewat header di bawah.
export const dynamic = "force-dynamic";

/** Sisi yang diminta harus angka bulat & masuk akal - ini dipakai mengalokasikan kanvas. */
function readSide(raw: string | null): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 64 || n > SPLASH_MAX_SIDE) return null;
  return n;
}

/** Batas ukuran berkas gambar yang mau dimuat ke memori sebagai data URI. */
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

/**
 * Mengambil gambar sumber dan mengubahnya jadi data URI.
 *
 * Diambil SENDIRI, bukan diserahkan ke perender sebagai URL, dan itu bukan
 * optimasi melainkan satu-satunya cara menangani kegagalannya. Perender
 * mengeluarkan hasilnya sebagai stream: begitu JSX diserahkan, galat apa pun di
 * dalamnya terjadi SETELAH respons mulai dikirim, jadi tidak ada try/catch yang
 * bisa menangkapnya dan yang diterima iOS adalah gambar yang putus di tengah.
 * Dengan diambil lebih dulu, gagalnya ketahuan selagi masih bisa diganti dengan
 * layar berwarna polos.
 */
async function loadImageData(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;

    const type = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
    // Perender hanya dijamin mengerti PNG dan JPEG. Format lain lebih baik
    // ditolak di sini daripada menghasilkan gambar rusak di layar pembuka.
    if (type !== "image/png" && type !== "image/jpeg") return null;

    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_SOURCE_BYTES) return null;

    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > MAX_SOURCE_BYTES) return null;

    return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind: PwaAppKind = url.searchParams.get("app") === "admin" ? "admin" : "toko";
  const width = readSide(url.searchParams.get("w"));
  const height = readSide(url.searchParams.get("h"));
  if (!width || !height) {
    return new Response("Ukuran layar pembuka tidak valid.", { status: 400 });
  }

  const settings = await getPwaSettings();
  const app = settings[kind];
  const box = { width, height };

  // Aset bawaan disimpan sebagai path relatif (/icons/...), sedangkan ikon &
  // gambar unggahan sudah berupa URL blob lengkap. Perender gambar mengambilnya
  // lewat jaringan, jadi keduanya harus dijadikan URL absolut lebih dulu.
  const absolute = (u: string) => (/^https?:\/\//i.test(u) ? u : new URL(u, url.origin).toString());

  const custom = pickSplashImage(app.splash, box);
  const source = custom
    ? { url: custom.url, ...coverSize(custom, box), radius: 0 }
    : (() => {
        // Belum ada gambar kustom: rakit sendiri dari warna latar + ikon app,
        // jauh lebih besar daripada yang dipasang splash bawaan Android. Sudut
        // dibulatkan supaya bentuknya terbaca sebagai ikon aplikasi, bukan
        // sebagai gambar yang kebetulan berlatar beda warna.
        const side = autoLogoSize(box);
        return { url: resolveIcon(app, kind).any, width: side, height: side, radius: Math.round(side * 0.22) };
      })();

  const data = await loadImageData(absolute(source.url));
  if (!data) {
    // Layar berwarna polos, BUKAN 500. Kalau route ini gagal, yang dilihat
    // pemakai iOS adalah layar kosong putih - persis keadaan yang sedang
    // diperbaiki di sini. Warna app saja sudah jauh lebih baik dari itu.
    console.error("Gambar layar pembuka gagal dimuat", { kind, url: source.url });
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          position: "relative",
          backgroundColor: app.backgroundColor,
        }}
      >
        {data ? (
          // Diposisikan absolut, bukan di-"object-fit". Kanvasnya sendiri sudah
          // berukuran width x height, jadi bagian gambar yang keluar dari kanvas
          // memang tidak ikut tergambar - tidak perlu aturan pemotongan apa pun.
          // eslint-disable-next-line @next/next/no-img-element -- dirender ke PNG oleh satori, bukan oleh browser
          <img
            src={data}
            alt=""
            width={source.width}
            height={source.height}
            style={{
              position: "absolute",
              left: Math.round((width - source.width) / 2),
              top: Math.round((height - source.height) / 2),
              borderRadius: source.radius,
            }}
          />
        ) : null}
      </div>
    ),
    {
      width,
      height,
      headers: {
        // Aman "immutable" karena URL-nya membawa sidik jari pengaturan:
        // pengaturan berubah -> URL berubah -> perangkat mengambil yang baru.
        "Cache-Control": "public, max-age=604800, s-maxage=31536000, immutable",
      },
    },
  );
}
