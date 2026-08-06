"use client";

import { useEffect, useState } from "react";
import { Headset, MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FloatingSupportButton({
  whatsappCs,
  telegramCs,
}: {
  whatsappCs: string;
  telegramCs: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!whatsappCs && !telegramCs) return null;

  return (
    <div className="fixed right-4 bottom-4 z-40 flex flex-col items-end gap-2">
      {open && (
        <div className="flex flex-col gap-1 rounded-lg border bg-card p-2 shadow-lg">
          {whatsappCs && (
            <a
              href={`https://wa.me/${whatsappCs}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              WhatsApp
            </a>
          )}
          {telegramCs && (
            <a
              href={`https://t.me/${telegramCs}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              <Send className="size-4" aria-hidden="true" />
              Telegram
            </a>
          )}
        </div>
      )}
      <Button
        size="icon-lg"
        className="size-12 rounded-full shadow-lg"
        aria-label={open ? "Tutup bantuan" : "Hubungi bantuan"}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X className="size-5" /> : <Headset className="size-5" />}
      </Button>
    </div>
  );
}
