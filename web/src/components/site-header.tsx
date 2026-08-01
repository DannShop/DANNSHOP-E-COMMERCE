import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
          <CategoryDrawer categories={categories} />
          {session?.user ? (
            <>
              {session.user.role === "ADMIN" && (
                <Link
                  href="/admin"
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                >
                  Admin
                </Link>
              )}
              <Link
                href="/account"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                Akun
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <Button type="submit" variant="outline" size="sm">
                  Keluar
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                Masuk
              </Link>
              <Link href="/register" className={cn(buttonVariants({ size: "sm" }))}>
                Daftar
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
