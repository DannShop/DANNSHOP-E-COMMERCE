"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { EmailProviderStatus } from "@/lib/notify/email-config";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export function EmailConfigForm({
  status,
  action,
}: {
  status: EmailProviderStatus;
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [kind, setKind] = useState<"resend" | "smtp">(status.kind ?? "resend");
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );

  return (
    <div className="flex flex-col gap-3">
      {status.configured ? (
        <div className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
          Aktif via {status.kind === "smtp" ? "SMTP" : "Resend"} — pengirim: {status.fromEmail}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          Belum dikonfigurasi — email invoice/notifikasi tidak akan terkirim sampai diisi.
        </div>
      )}

      <div className="flex gap-1">
        <Button type="button" size="xs" variant={kind === "resend" ? "default" : "outline"} onClick={() => setKind("resend")}>
          Resend
        </Button>
        <Button type="button" size="xs" variant={kind === "smtp" ? "default" : "outline"} onClick={() => setKind("smtp")}>
          SMTP
        </Button>
      </div>

      <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-3">
        <input type="hidden" name="kind" value={kind} />

        {kind === "resend" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="email-resend-key">API Key Resend</Label>
              <Input
                id="email-resend-key"
                name="apiKey"
                type="password"
                autoComplete="off"
                placeholder={status.configured && status.kind === "resend" ? "Isi untuk mengganti yang tersimpan" : "re_..."}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-resend-from">Alamat Pengirim</Label>
              <Input
                id="email-resend-from"
                name="fromEmail"
                autoComplete="off"
                defaultValue={status.kind === "resend" ? (status.fromEmail ?? "") : ""}
                placeholder="DannShop <invoice@domainmu.com>"
              />
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="email-smtp-host">Host SMTP</Label>
                <Input id="email-smtp-host" name="host" autoComplete="off" placeholder="smtp.example.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email-smtp-port">Port</Label>
                <Input id="email-smtp-port" name="port" inputMode="numeric" autoComplete="off" placeholder="587" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="secure" />
              Gunakan koneksi TLS langsung (biasanya untuk port 465)
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="email-smtp-user">User SMTP</Label>
                <Input id="email-smtp-user" name="user" autoComplete="off" placeholder="user@domainmu.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email-smtp-pass">Password SMTP</Label>
                <Input
                  id="email-smtp-pass"
                  name="password"
                  type="password"
                  autoComplete="off"
                  placeholder={status.configured && status.kind === "smtp" ? "Isi untuk mengganti yang tersimpan" : ""}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-smtp-from">Alamat Pengirim</Label>
              <Input
                id="email-smtp-from"
                name="fromEmail"
                autoComplete="off"
                defaultValue={status.kind === "smtp" ? (status.fromEmail ?? "") : ""}
                placeholder="DannShop <invoice@domainmu.com>"
              />
            </div>
          </>
        )}

        <p className="text-xs text-muted-foreground">
          Kredensial tersimpan terenkripsi dan tidak pernah ditampilkan lagi setelah disimpan — kolom di atas selalu
          kosong walau sudah pernah diisi.
        </p>

        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Menyimpan..." : "Simpan Konfigurasi Email"}
        </Button>
        {(state.ok || state.error) && (
          <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700"}`}>
            {state.error ?? state.ok}
          </p>
        )}
      </form>
    </div>
  );
}
