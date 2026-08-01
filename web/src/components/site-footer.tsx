import { MessageCircle, Send } from "lucide-react";

const WHATSAPP_CS = process.env.NEXT_PUBLIC_WHATSAPP_CS ?? "";
const TELEGRAM_CS = process.env.NEXT_PUBLIC_TELEGRAM_CS ?? "";

export function SiteFooter() {
  return (
    <footer className="border-t py-6 text-center text-sm text-muted-foreground">
      {(WHATSAPP_CS || TELEGRAM_CS) && (
        <div className="mb-3 flex items-center justify-center gap-4">
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
      © {new Date().getFullYear()} DannShop. Topup game & PPOB otomatis 24 jam.
    </footer>
  );
}
