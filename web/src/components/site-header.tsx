import Link from "next/link";
import { auth } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { SearchOverlay } from "@/components/search-overlay";
import { CategoryDrawer } from "@/components/category-drawer";
import { SiteLogo } from "@/components/site-logo";
import { getCatalogHomeData } from "@/lib/catalog/public";
import { getSiteSettings } from "@/lib/site-settings";

export async function SiteHeader() {
  const [session, categories, settings] = await Promise.all([auth(), getCatalogHomeData(), getSiteSettings()]);

  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center">
          <SiteLogo logoUrl={settings.logoUrl} logoType={settings.logoType} className="h-8 max-w-32" />
        </Link>

        <nav className="ml-auto flex shrink-0 items-center gap-2">
          <SearchOverlay />
          <ThemeToggle />
          <CategoryDrawer
            categories={categories}
            session={session}
            whatsappCs={settings.whatsappCs}
            telegramCs={settings.telegramCs}
          />
        </nav>
      </div>
    </header>
  );
}
