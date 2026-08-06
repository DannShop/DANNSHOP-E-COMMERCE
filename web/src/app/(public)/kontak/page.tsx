import type { Metadata } from "next";
import { MessageCircle, Send, Clock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getSiteSettings } from "@/lib/site-settings";

export const metadata: Metadata = { title: "Kontak" };

export default async function ContactPage() {
  const { whatsappCs, telegramCs } = await getSiteSettings();

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Kontak</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ada pertanyaan atau kendala transaksi? Hubungi kami lewat channel di bawah ini.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {whatsappCs && (
          <a
            href={`https://wa.me/${whatsappCs}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", className: "h-12 justify-start gap-3 text-base" })}
          >
            <MessageCircle className="size-5" aria-hidden="true" />
            Chat via WhatsApp
          </a>
        )}
        {telegramCs && (
          <a
            href={`https://t.me/${telegramCs}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", className: "h-12 justify-start gap-3 text-base" })}
          >
            <Send className="size-5" aria-hidden="true" />
            Chat via Telegram
          </a>
        )}
        {!whatsappCs && !telegramCs && (
          <p className="text-sm text-muted-foreground">Channel CS belum dikonfigurasi.</p>
        )}
      </div>

      <div className="flex items-start gap-3 rounded-[var(--radius)] border bg-muted/40 p-4 text-sm">
        <Clock className="size-4 shrink-0 translate-y-0.5 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="font-medium">Jam Operasional CS</p>
          <p className="mt-0.5 text-muted-foreground">Setiap hari, 08.00 – 22.00 WIB</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sistem topup berjalan otomatis 24 jam — di luar jam operasional, respons CS mungkin lebih lambat.
          </p>
        </div>
      </div>
    </div>
  );
}
