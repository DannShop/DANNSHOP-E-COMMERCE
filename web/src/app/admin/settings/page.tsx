import { getSiteSettings } from "@/lib/site-settings";
import { getEmailProviderStatus } from "@/lib/notify/email-config";
import { getTelegramNotifyStatus } from "@/lib/notify/telegram-config";
import {
  saveLogo,
  saveTrendingMode,
  uploadLogoFile,
  saveFavicon,
  uploadFaviconFile,
  saveFaqItems,
  saveTosContent,
  savePrivacyContent,
  saveMaintenanceMode,
  saveContactSettings,
  saveEmailConfig,
  saveTelegramConfig,
  sendTelegramTest,
  changeAdminPassword,
} from "@/app/actions/settings";
import { ChangePasswordForm } from "@/components/change-password-form";
import { LogoForm } from "./logo-form";
import { TrendingModeForm } from "./trending-mode-form";
import { FaviconForm } from "./favicon-form";
import { FaqForm } from "./faq-form";
import { ContentPageForm } from "./content-page-form";
import { MaintenanceModeForm } from "./maintenance-mode-form";
import { ContactForm } from "./contact-form";
import { EmailConfigForm } from "./email-config-form";
import { TelegramConfigForm } from "./telegram-config-form";

export default async function SiteSettingsPage() {
  const [settings, emailStatus, telegramStatus] = await Promise.all([
    getSiteSettings(),
    getEmailProviderStatus(),
    getTelegramNotifyStatus(),
  ]);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Pengaturan Situs</h1>
        <p className="text-sm text-muted-foreground">Identitas, konten statis, dan mode maintenance situs.</p>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">Logo</h2>
        <LogoForm
          initial={{ logoUrl: settings.logoUrl, logoType: settings.logoType }}
          action={saveLogo}
          uploadLogoFile={uploadLogoFile}
        />
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">Favicon</h2>
        <FaviconForm initial={{ faviconUrl: settings.faviconUrl }} action={saveFavicon} uploadFaviconFile={uploadFaviconFile} />
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">Section Trending</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Manual: pilih produk trending lewat centang &quot;Trending&quot; di form produk. Otomatis: 4 produk dengan
          order sukses terbanyak 7 hari terakhir (fallback ke manual kalau kurang dari 4).
        </p>
        <TrendingModeForm initial={settings.trendingMode} action={saveTrendingMode} />
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">Pengiriman Email (Resend/SMTP)</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Dipakai untuk email invoice pesanan, notifikasi pesanan berhasil/gagal, dsb.
        </p>
        <EmailConfigForm status={emailStatus} action={saveEmailConfig} />
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">Kontak CS</h2>
        <ContactForm
          initial={{ whatsappCs: settings.whatsappCs, telegramCs: settings.telegramCs, csHours: settings.csHours }}
          action={saveContactSettings}
        />
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">Notifikasi Telegram (Admin)</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Bot yang mengirimkan kabar transaksi ke kamu: order gagal, refund, saldo provider menipis, dan lainnya.
        </p>
        <TelegramConfigForm status={telegramStatus} action={saveTelegramConfig} testAction={sendTelegramTest} />
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">FAQ</h2>
        <FaqForm initial={settings.faqItems} action={saveFaqItems} />
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">Syarat &amp; Ketentuan</h2>
        <ContentPageForm initial={settings.tosContent} action={saveTosContent} submitLabel="Simpan Syarat & Ketentuan" />
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">Kebijakan Privasi</h2>
        <ContentPageForm initial={settings.privacyContent} action={savePrivacyContent} submitLabel="Simpan Kebijakan Privasi" />
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">Ganti Password</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Password akun admin ini. Setelah berhasil diganti, kamu otomatis dilogout dan harus login ulang.
        </p>
        <ChangePasswordForm action={changeAdminPassword} idPrefix="admin" />
      </div>

      <div className="rounded-lg border-2 border-destructive/40 p-4">
        <h2 className="mb-3 text-sm font-semibold">Maintenance Mode</h2>
        <MaintenanceModeForm
          initial={{ maintenanceMode: settings.maintenanceMode, maintenanceMessage: settings.maintenanceMessage }}
          action={saveMaintenanceMode}
        />
      </div>
    </div>
  );
}
