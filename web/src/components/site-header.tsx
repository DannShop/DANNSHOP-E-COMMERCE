import Link from "next/link";
import { auth } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { SearchOverlay } from "@/components/search-overlay";
import { CategoryDrawer } from "@/components/category-drawer";
import { getCatalogHomeData } from "@/lib/catalog/public";

export async function SiteHeader() {
  const [session, categories] = await Promise.all([auth(), getCatalogHomeData()]);

  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold">
          DannShop
        </Link>
        <nav className="flex items-center gap-2">
          <SearchOverlay />
          <ThemeToggle />
          <CategoryDrawer categories={categories} session={session} />
        </nav>
      </div>
    </header>
  );
}
