import { getInvoiceBranding } from "@/lib/invoice/branding";
import { getManualOrderSettings } from "@/lib/invoice/manual-order";
import { getEmailTemplates, EMAIL_TEMPLATE_KEYS, EMAIL_TEMPLATE_META } from "@/lib/notify/email-templates";
import {
  saveBranding,
  uploadInvoiceLogo,
  saveEmailTemplateAction,
  resetEmailTemplateAction,
  previewEmailTemplateAction,
  saveManualOrderSettingsAction,
} from "@/app/actions/invoice-settings";
import { BrandingForm } from "./branding-form";
import { EmailTemplateEditor } from "./email-template-editor";
import { ManualOrderForm } from "./manual-order-form";

export default async function InvoiceSettingsPage() {
  const [branding, manual, templates] = await Promise.all([
    getInvoiceBranding(),
    getManualOrderSettings(),
    getEmailTemplates(),
  ]);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Invoice, Email &amp; Struk</h1>
        <p className="text-sm text-muted-foreground">
          Identitas yang muncul di setiap dokumen yang keluar ke pembeli, isi email otomatis, dan pengaturan produk
          yang dikirim manual.
        </p>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-1 text-sm font-semibold">Identitas Dokumen</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Dipakai bersama oleh email invoice, halaman invoice, dan struk cetak — diubah sekali, berlaku di ketiganya.
        </p>
        <BrandingForm initial={branding} action={saveBranding} uploadLogo={uploadInvoiceLogo} />
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Template Email</h2>
          <p className="text-xs text-muted-foreground">
            Klik salah satu untuk mengedit. Setiap template punya tombol pratinjau memakai data contoh, jadi kamu bisa
            melihat hasilnya sebelum ada pelanggan yang menerimanya.
          </p>
        </div>
        {EMAIL_TEMPLATE_KEYS.map((key) => (
          <EmailTemplateEditor
            key={key}
            templateKey={key}
            meta={EMAIL_TEMPLATE_META[key]}
            initial={templates[key]}
            save={saveEmailTemplateAction}
            reset={resetEmailTemplateAction}
            preview={previewEmailTemplateAction}
          />
        ))}
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-1 text-sm font-semibold">Konfirmasi Order Manual (App Premium)</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Berlaku untuk produk yang mode pengirimannya diset <strong>Manual</strong> di form produk. Setelah pembeli
          membayar, halaman invoice-nya menampilkan tombol konfirmasi berisi pesan di bawah ini.
        </p>
        <ManualOrderForm initial={manual} action={saveManualOrderSettingsAction} />
      </div>
    </div>
  );
}
