"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MANUAL_ORDER_PLACEHOLDERS, type ManualOrderChannel, type ManualOrderSettings } from "@/lib/invoice/manual-order";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

const CHANNELS: { value: ManualOrderChannel; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp saja" },
  { value: "telegram", label: "Telegram saja" },
  { value: "both", label: "Dua-duanya" },
];

export function ManualOrderForm({
  initial,
  action,
}: {
  initial: ManualOrderSettings;
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );
  const [channel, setChannel] = useState<ManualOrderChannel>(initial.channel);
  const [template, setTemplate] = useState(initial.messageTemplate);

  const showWa = channel === "whatsapp" || channel === "both";
  const showTg = channel === "telegram" || channel === "both";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="space-y-1.5">
        <Label htmlFor="manual-channel">Kanal konfirmasi</Label>
        <select
          id="manual-channel"
          name="channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value as ManualOrderChannel)}
          className="h-9 w-full max-w-xs rounded-md border bg-transparent px-3 text-sm"
        >
          {CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {showWa && (
          <div className="space-y-1.5">
            <Label htmlFor="manual-wa">Nomor WhatsApp admin</Label>
            <Input
              id="manual-wa"
              name="whatsappNumber"
              defaultValue={initial.whatsappNumber}
              inputMode="numeric"
              placeholder="6281234567890"
            />
            <p className="text-xs text-muted-foreground">Format internasional tanpa tanda +. Kosong = pakai CS.</p>
          </div>
        )}
        {showTg && (
          <div className="space-y-1.5">
            <Label htmlFor="manual-tg">Username Telegram admin</Label>
            <Input id="manual-tg" name="telegramUsername" defaultValue={initial.telegramUsername} placeholder="usernamemu" />
            <p className="text-xs text-muted-foreground">
              Username asli (tanpa @), bukan bot notifikasi. Telegram tidak bisa mengisi teks pesan otomatis — pembeli
              memakai tombol &quot;salin pesan&quot;.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="manual-note">Keterangan di halaman invoice</Label>
        <Textarea id="manual-note" name="invoiceNote" defaultValue={initial.invoiceNote} rows={2} maxLength={500} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="manual-template">Template pesan konfirmasi</Label>
        <Textarea
          id="manual-template"
          name="messageTemplate"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={12}
          className="font-mono text-xs"
          required
        />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {MANUAL_ORDER_PLACEHOLDERS.map((p) => (
            <button
              key={p.name}
              type="button"
              title={p.description}
              onClick={() => setTemplate((c) => `${c}{{${p.name}}}`)}
              className="rounded border bg-background px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted"
            >
              {`{{${p.name}}}`}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Teks polos, bukan HTML — ini dibuka langsung di kolom chat pembeli.
        </p>
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Menyimpan..." : "Simpan Konfirmasi Order Manual"}
      </Button>

      {(state.ok || state.error) && (
        <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
