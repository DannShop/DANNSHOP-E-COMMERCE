"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, TriangleAlert, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { MidtransConfigStatus } from "@/lib/payment/gateway-config";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export function MidtransConfigForm({
  status,
  webhookUrl,
  action,
}: {
  status: MidtransConfigStatus;
  webhookUrl: string;
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );
  const [copied, setCopied] = useState(false);

  async function copyWebhookUrl() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API bisa tidak tersedia — abaikan diam-diam
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {status.configured ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
          Mode {status.isProduction ? "Production" : "Sandbox"} — server key {status.serverKeyMasked}
          {status.source === "env" && " (dari environment variable, belum diatur lewat panel ini)"}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          Belum dikonfigurasi — semua pembayaran non-saldo akan gagal sampai server key diisi.
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-3">
        <div className="space-y-1.5">
          <Label htmlFor="midtrans-server-key">Server Key</Label>
          <Input
            id="midtrans-server-key"
            name="serverKey"
            type="password"
            autoComplete="off"
            placeholder={status.configured ? "Isi untuk mengganti yang tersimpan" : "Mid-server-..."}
          />
          <p className="text-xs text-muted-foreground">
            Ambil di dashboard Midtrans → Settings → Access Keys, sesuai mode (Sandbox/Production) yang aktif di
            sana. Pastikan togglenya di bawah cocok dengan mode key yang kamu salin.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="midtrans-merchant-id">Merchant ID (opsional)</Label>
          <Input
            id="midtrans-merchant-id"
            name="merchantId"
            autoComplete="off"
            defaultValue={status.merchantId ?? ""}
            placeholder="G123456789"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="isProduction" defaultChecked={status.isProduction} />
          Mode Production (jangan dicentang selama masih pakai key sandbox)
        </label>

        <p className="text-xs text-muted-foreground">
          Server key tersimpan terenkripsi dan tidak pernah ditampilkan lagi setelah disimpan. Client key sengaja tidak
          ada di sini — integrasi memakai Core API yang tidak memerlukannya.
        </p>

        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Menyimpan..." : "Simpan Kredensial"}
        </Button>
        {(state.ok || state.error) && (
          <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700"}`}>{state.error ?? state.ok}</p>
        )}
      </form>

      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <p className="text-sm font-medium">URL Notifikasi Pembayaran</p>
        <p className="text-xs text-muted-foreground">
          Paste ke dashboard Midtrans → Settings → Configuration → Payment Notification URL. Kalau ini belum terpasang,
          pembayaran yang sudah dibayar customer tidak akan terdeteksi otomatis lewat webhook.
        </p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 rounded bg-muted px-2 py-1.5 text-xs break-all">{webhookUrl}</code>
          <Button type="button" size="xs" variant="outline" className="shrink-0" onClick={copyWebhookUrl}>
            {copied ? (
              <>
                <Check className="size-3.5" /> Tersalin
              </>
            ) : (
              <>
                <Copy className="size-3.5" /> Salin
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
