import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { FloatingSupportButton } from "@/components/floating-support-button";
import { AnalyticsTracker } from "@/components/analytics-tracker";
import { StorefrontCustomCss } from "@/components/storefront-theme";
import { getSiteSettings } from "@/lib/site-settings";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const { whatsappCs, telegramCs } = await getSiteSettings();

  // min-h-dvh, BUKAN min-h-screen: min-h-screen = 100vh = tinggi viewport SAAT
  // URL BAR TERSEMBUNYI. Di HP dengan URL bar terlihat, itu selalu lebih tinggi
  // dari layar yang benar-benar tampak, jadi halaman punya sisa scroll beberapa
  // puluh piksel walau kontennya pendek - terasa seperti "scroll berlebihan"
  // yang tidak menuju ke mana-mana. dvh mengikuti tinggi viewport yang
  // sebenarnya terlihat.
  return (
    <div className="flex min-h-dvh flex-col">
      <StorefrontCustomCss />
      <SiteHeader />
      <main className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-8">{children}</main>
      <SiteFooter />
      <FloatingSupportButton whatsappCs={whatsappCs} telegramCs={telegramCs} />
      {/* Hanya dipasang di layout PUBLIK - panel admin sengaja tidak ikut
          terhitung, kalau tidak statistik "pengunjung" akan didominasi oleh
          admin sendiri yang membuka-buka panelnya seharian. */}
      <AnalyticsTracker />
    </div>
  );
}
