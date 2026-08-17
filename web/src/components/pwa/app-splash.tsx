import { PWA_APP_KINDS, resolveIcon, type PwaAppKind, type PwaAppSettings } from "@/lib/pwa/config";
import { getPwaSettings } from "@/lib/pwa/settings";

// Layar pembuka DI DALAM aplikasi.
//
// Inilah bagian yang benar-benar bisa dibuat sebesar apa pun. Splash bawaan
// Android dirakit Chrome dari background_color + ikon pada ukuran tetap dan
// tidak bisa diperbesar lewat manifest, sedangkan iOS tanpa startup image
// menampilkan layar kosong. Yang ini berlaku di dua-duanya, dan yang menutup
// jeda dari "splash sistem selesai" sampai "halaman siap".
//
// Dirender SERVER-SIDE dan ikut di HTML pertama - bukan komponen klien. Layar
// pembuka yang baru muncul setelah bundel JS dimuat datang tepat setelah
// halamannya sendiri terlihat, jadi yang dihasilkannya kedipan, bukan kehalusan.
//
// Bentuk & perilakunya ada di globals.css; yang di sini cuma bagian yang
// berubah mengikuti pengaturan admin.

/** Membungkus URL jadi nilai CSS url() yang aman untuk disisipkan ke <style>. */
function cssUrl(url: string): string {
  // JSON.stringify menghasilkan string berkutip ganda dengan " dan \ yang sudah
  // di-escape - itu persis bentuk string CSS yang sah, dan menutup satu-satunya
  // jalan keluar dari dalam url(). Nilai ini berasal dari DB, dan DB bukan
  // sesuatu yang boleh dipercaya untuk disisipkan mentah ke dalam stylesheet.
  return `url(${JSON.stringify(url)})`;
}

function faceRules(kind: PwaAppKind, app: PwaAppSettings): string {
  const face = `#app-splash .app-splash-face[data-face="${kind}"]`;
  const rules = [`${face}{background-color:${app.backgroundColor}}`];

  if (app.splash.portrait) {
    rules.push(`${face}{background-image:${cssUrl(app.splash.portrait.url)}}`);
    // Varian lanskap hanya ditimpa kalau memang diunggah. Kalau tidak, gambar
    // potret tetap dipakai dan di-cover - pita tengahnya yang terlihat.
    if (app.splash.landscape) {
      rules.push(
        `@media (orientation:landscape){${face}{background-image:${cssUrl(app.splash.landscape.url)}}}`,
      );
    }
  } else {
    // Mode otomatis: warna latar + ikon app diperbesar di tengah.
    rules.push(
      `${face} .app-splash-logo{background-image:${cssUrl(resolveIcon(app, kind).any)}}`,
    );
  }

  return rules.join("");
}

export async function AppSplash() {
  const settings = await getPwaSettings();

  // Dua sisi dirender sekaligus dan CSS yang memilih salah satunya (lihat
  // data-app di globals.css). Sisi yang tidak terpakai tetap display:none, dan
  // browser tidak pernah mengunduh gambar latar milik elemen display:none -
  // jadi ini nol biaya jaringan, bukan sekadar nol biaya tampilan.
  const css = PWA_APP_KINDS.map((kind) => faceRules(kind, settings[kind])).join("");

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {/* aria-hidden + tanpa teks: layar ini murni kosmetik dan hilang sendiri,
          jadi pembaca layar tidak boleh mengumumkannya sebagai isi halaman. */}
      <div id="app-splash" aria-hidden="true">
        {PWA_APP_KINDS.map((kind) => (
          <div key={kind} className="app-splash-face" data-face={kind}>
            {settings[kind].splash.portrait ? null : <span className="app-splash-logo" />}
          </div>
        ))}
      </div>
    </>
  );
}
