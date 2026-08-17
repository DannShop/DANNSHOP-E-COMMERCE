import { getInvoiceBranding } from "@/lib/invoice/branding";
import { getPwaSettings } from "@/lib/pwa/settings";
import { savePwaAppSettings, uploadPwaIcon, uploadPwaSplash } from "@/app/actions/pwa";
import { MobileAppForm } from "./mobile-app-form";
import { InstallStatus } from "./install-status";

export default async function MobileAppPage() {
  const [settings, branding] = await Promise.all([getPwaSettings(), getInvoiceBranding()]);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Aplikasi Mobile</h1>
        <p className="text-sm text-muted-foreground">
          Toko ini bisa dipasang ke layar utama HP sebagai aplikasi — tanpa Play Store, tanpa App
          Store. Ada dua aplikasi terpisah: satu untuk pembeli, satu untuk kamu mengelola toko.
        </p>
      </div>

      <InstallStatus />

      <MobileAppForm
        initial={settings}
        brandName={branding.brandName}
        action={savePwaAppSettings}
        uploadIcon={uploadPwaIcon}
        uploadSplash={uploadPwaSplash}
      />

      <div className="rounded-lg border border-dashed p-4">
        <h2 className="text-sm font-semibold">Cara memasang di HP</h2>
        <div className="mt-3 space-y-3 text-xs text-muted-foreground">
          <p>
            <strong className="font-semibold text-foreground">Android (Chrome):</strong> buka
            halamannya, ketuk menu tiga titik, pilih &quot;Instal aplikasi&quot; atau
            &quot;Tambahkan ke Layar utama&quot;. Untuk aplikasi Admin, pasang dari halaman panel
            admin — bukan dari halaman toko.
          </p>
          <p>
            <strong className="font-semibold text-foreground">iPhone/iPad (Safari):</strong> buka
            halamannya, ketuk tombol Bagikan di bilah bawah, gulir lalu pilih &quot;Tambahkan ke
            Layar Utama&quot;. iOS tidak mengizinkan situs memasang dirinya sendiri, jadi tidak ada
            jalan lain selain menu ini. Chrome/Firefox di iOS tidak bisa memasang aplikasi sama
            sekali.
          </p>
          <p>
            <strong className="font-semibold text-foreground">Setelah terpasang:</strong> aplikasi
            yang dipasang punya penyimpanan sesi sendiri — kamu perlu login sekali lagi di dalamnya.
            Ini perilaku bawaan iOS/Android, bukan gangguan.
          </p>
          <p>
            <strong className="font-semibold text-foreground">Mengganti ikon atau nama:</strong> app
            yang sudah terpasang memperbarui dirinya sendiri dalam beberapa jam. Kalau ingin langsung
            kelihatan, hapus lalu pasang ulang dari HP.
          </p>
          <p>
            <strong className="font-semibold text-foreground">Soal layar pembuka:</strong> ada dua
            yang berbeda. Yang pertama dirakit sendiri oleh HP sebelum app sempat berjalan — di
            Android dari warna latar + ikon (tidak bisa diganti gambar), di iPhone/iPad dari gambar
            yang kamu unggah di sini. Yang kedua ada di dalam app dan itulah yang memakai gambarmu di
            kedua sistem. Karena itu warna latar sebaiknya senada dengan gambarnya, supaya peralihan
            dari yang pertama ke yang kedua tidak terlihat sebagai kedipan warna.
          </p>
        </div>
      </div>
    </div>
  );
}
