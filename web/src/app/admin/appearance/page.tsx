import { getStorefrontAppearance } from "@/lib/storefront/appearance";
import { saveAppearanceAction, previewSlotHtml } from "@/app/actions/appearance";
import { AppearanceForm } from "./appearance-form";

export default async function AppearancePage() {
  const appearance = await getStorefrontAppearance();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Tampilan &amp; Tema</h1>
        <p className="text-sm text-muted-foreground">
          Warna, kelengkungan sudut, CSS kustom, dan potongan HTML yang disisipkan ke halaman-halaman storefront.
        </p>
      </div>

      <div className="rounded-lg border-l-2 border-amber-500/50 bg-amber-500/5 p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Yang bisa dan tidak bisa diubah di sini.</strong> Kamu bisa mengubah tema,
        menyisipkan HTML ke titik-titik yang tersedia, dan mengatur teks di dokumen keluar (lihat{" "}
        <strong>Invoice &amp; Struk</strong>). Yang <em>tidak</em> bisa diganti adalah markup halaman login, checkout,
        invoice, dan deposit. Itu bukan batasan yang dibuat-buat: halaman-halaman tersebut menjalankan pembayaran
        Midtrans, polling status tiap tiga detik, dan Server Action ber-CSRF. HTML buatan tangan tidak akan tersambung
        ke satu pun di antaranya — tombol bayarnya akan terlihat benar tapi tidak berfungsi, dan itu baru ketahuan dari
        pembeli yang uangnya sudah keluar. Model slot memberi keleluasaan tata letak di sekeliling alur pembayaran
        tanpa membuat alur pembayarannya sendiri bisa patah.
      </div>

      <AppearanceForm initial={appearance} action={saveAppearanceAction} preview={previewSlotHtml} />
    </div>
  );
}
