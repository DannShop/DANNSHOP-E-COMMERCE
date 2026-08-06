import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { FloatingSupportButton } from "@/components/floating-support-button";
import { getSiteSettings } from "@/lib/site-settings";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const { whatsappCs, telegramCs } = await getSiteSettings();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-8">{children}</main>
      <SiteFooter />
      <FloatingSupportButton whatsappCs={whatsappCs} telegramCs={telegramCs} />
    </div>
  );
}
