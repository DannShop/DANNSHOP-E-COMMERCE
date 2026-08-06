"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export function ContactForm({
  initial,
  action,
}: {
  initial: { whatsappCs: string; telegramCs: string; csHours: string };
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="contact-wa">Nomor WhatsApp CS</Label>
        <Input id="contact-wa" name="whatsappCs" defaultValue={initial.whatsappCs} placeholder="6281234567890" />
        <p className="text-xs text-muted-foreground">Format internasional tanpa tanda +, mis. 6281234567890.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contact-tele">Username Bot/Akun Telegram CS</Label>
        <Input id="contact-tele" name="telegramCs" defaultValue={initial.telegramCs} placeholder="dannshop_cs" />
        <p className="text-xs text-muted-foreground">Tanpa tanda @, mis. dannshop_cs.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contact-hours">Jam Operasional CS</Label>
        <Input id="contact-hours" name="csHours" defaultValue={initial.csHours} placeholder="Setiap hari, 08.00 – 22.00 WIB" />
        <p className="text-xs text-muted-foreground">Tampil di halaman Kontak. Sistem topup sendiri tetap otomatis 24 jam.</p>
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Menyimpan..." : "Simpan Kontak"}
      </Button>
      {(state.ok || state.error) && (
        <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
