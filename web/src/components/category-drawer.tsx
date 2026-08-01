"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X, Layers, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CatalogCategory } from "@/lib/catalog/public";

const WHATSAPP_CS = process.env.NEXT_PUBLIC_WHATSAPP_CS ?? "";
const TELEGRAM_CS = process.env.NEXT_PUBLIC_TELEGRAM_CS ?? "";

export function CategoryDrawer({ categories }: { categories: CatalogCategory[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <Button variant="ghost" size="icon" aria-label="Buka menu kategori" onClick={() => setOpen(true)}>
        <Menu className="size-4" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-background/60 backdrop-blur-sm">
          <div className="flex h-full w-full max-w-xs flex-col gap-4 overflow-y-auto border-l bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="font-heading text-lg font-bold">Kategori</span>
              <Button variant="ghost" size="icon" aria-label="Tutup menu" onClick={() => setOpen(false)}>
                <X className="size-4" />
              </Button>
            </div>

            <nav className="flex flex-col gap-1">
              {categories.map((c) => (
                <Link
                  key={c.id}
                  href={`/?kategori=${c.slug}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
                >
                  <Layers className="size-4 text-muted-foreground" aria-hidden="true" />
                  {c.name}
                </Link>
              ))}
            </nav>

            <div className="mt-auto flex flex-col gap-1 border-t pt-3">
              {WHATSAPP_CS && (
                <a
                  href={`https://wa.me/${WHATSAPP_CS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
                >
                  <MessageCircle className="size-4 text-muted-foreground" aria-hidden="true" />
                  Bantuan WhatsApp
                </a>
              )}
              {TELEGRAM_CS && (
                <a
                  href={`https://t.me/${TELEGRAM_CS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
                >
                  <Send className="size-4 text-muted-foreground" aria-hidden="true" />
                  Bantuan Telegram
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
