import Link from "next/link";
import Image from "next/image";
import { auth } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { SearchOverlay } from "@/components/search-overlay";
import { CategoryDrawer } from "@/components/category-drawer";
import { getCatalogHomeData } from "@/lib/catalog/public";
import { getSiteSettings } from "@/lib/site-settings";

export async function SiteHeader() {
  const [session, categories, settings] = await Promise.all([auth(), getCatalogHomeData(), getSiteSettings()]);

  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center">
          {settings.logoUrl ? (
            settings.logoType === "video" ? (
              <video
                src={settings.logoUrl}
                autoPlay
                loop
                muted
                playsInline
                className="h-8 w-auto max-w-32 object-contain"
              />
            ) : (
              <Image src={settings.logoUrl} alt="DannShop" width={120} height={32} className="h-8 w-auto object-contain" unoptimized />
            )
          ) : (
            <span className="text-lg font-bold">DannShop</span>
          )}
        </Link>

        <nav className="ml-auto flex shrink-0 items-center gap-2">
          <SearchOverlay />
          <ThemeToggle />
          <CategoryDrawer categories={categories} session={session} />
        </nav>
      </div>
    </header>
  );
}
