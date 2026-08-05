import { getSiteSettings } from "@/lib/site-settings";
import { saveLogo, saveTrendingMode, uploadLogoFile } from "@/app/actions/settings";
import { LogoForm } from "./logo-form";
import { TrendingModeForm } from "./trending-mode-form";

export default async function SiteSettingsPage() {
  const settings = await getSiteSettings();

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Pengaturan Situs</h1>
        <p className="text-sm text-muted-foreground">Logo header dan sumber section Trending di halaman utama.</p>
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
        <h2 className="mb-3 text-sm font-semibold">Section Trending</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Manual: pilih produk trending lewat centang &quot;Trending&quot; di form produk. Otomatis: 4 produk dengan
          order sukses terbanyak 7 hari terakhir (fallback ke manual kalau kurang dari 4).
        </p>
        <TrendingModeForm initial={settings.trendingMode} action={saveTrendingMode} />
      </div>
    </div>
  );
}
