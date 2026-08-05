import Link from "next/link";
import { MessageCircle, Send } from "lucide-react";
import { db } from "@/lib/db";
import { PaymentMethodMarquee } from "@/components/payment-method-marquee";

const WHATSAPP_CS = process.env.NEXT_PUBLIC_WHATSAPP_CS ?? "";
const TELEGRAM_CS = process.env.NEXT_PUBLIC_TELEGRAM_CS ?? "";

const SUPPORT_LINKS = [
  { href: "/cek-transaksi", label: "Cek Transaksi" },
  { href: "/faq", label: "FAQ" },
  { href: "/syarat-ketentuan", label: "Syarat & Ketentuan" },
  { href: "/kebijakan-privasi", label: "Kebijakan Privasi" },
  { href: "/kontak", label: "Kontak" },
];

export async function SiteFooter() {
  const [categories, paymentMethods] = await Promise.all([
    db.category.findMany({ orderBy: { sortOrder: "asc" }, select: { slug: true, name: true } }),
    db.paymentMethodConfig.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, label: true, logoUrl: true },
    }),
  ]);

  return (
    <footer className="border-t">
      <PaymentMethodMarquee methods={paymentMethods} />

      <div className="mx-auto grid max-w-screen-2xl gap-8 px-4 py-10 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <p className="font-heading text-lg font-bold">DannShop</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Topup game, pulsa, e-money, dan PLN — murah, cepat, otomatis 24 jam.
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold">Peta Situs</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm text-muted-foreground">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link href={`/?kategori=${c.slug}`} className="hover:text-foreground">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold">Dukungan</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm text-muted-foreground">
            {SUPPORT_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-foreground">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold">Hubungi Kami</p>
          {(WHATSAPP_CS || TELEGRAM_CS) && (
            <div className="mt-2 flex flex-col gap-1.5 text-sm text-muted-foreground">
              {WHATSAPP_CS && (
                <a
                  href={`https://wa.me/${WHATSAPP_CS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:text-foreground"
                >
                  <MessageCircle className="size-4" aria-hidden="true" />
                  WhatsApp
                </a>
              )}
              {TELEGRAM_CS && (
                <a
                  href={`https://t.me/${TELEGRAM_CS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:text-foreground"
                >
                  <Send className="size-4" aria-hidden="true" />
                  Telegram
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border-t py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} DannShop. Topup game & PPOB otomatis 24 jam.
      </div>
    </footer>
  );
}
