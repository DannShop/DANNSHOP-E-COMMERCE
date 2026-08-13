"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Eye, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  regenerateMitraApiKey,
  regenerateMitraCallbackSecret,
  revealMitraCredentials,
  updateMitraConfig,
  type MitraResult,
  type MitraSecretResult,
} from "@/app/actions/mitra";

const INITIAL_SECRET: MitraSecretResult = {};
const INITIAL_RESULT: MitraResult = {};

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      aria-label={`Salin ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check className="size-3" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
      {copied ? "Tersalin" : "Salin"}
    </Button>
  );
}

function SecretRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-32 shrink-0 text-xs text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 rounded bg-foreground/10 px-2 py-1 font-mono text-xs break-all">{value}</code>
      <CopyButton value={value} label={label} />
    </div>
  );
}

/**
 * Kredensial mitra.
 *
 * Nilainya TIDAK ikut dikirim bersama HTML halaman — baru diambil lewat aksi
 * saat tombol "Tampilkan" ditekan. Bedanya nyata: halaman yang selalu memuat
 * rahasianya akan meninggalkan salinan di sumber halaman, cache browser, dan
 * setiap tangkapan layar yang kebetulan diambil untuk keperluan lain.
 */
export function CredentialsPanel({ username, hasCallbackSecret }: { username: string; hasCallbackSecret: boolean }) {
  const [reveal, revealAction, revealing] = useActionState(() => revealMitraCredentials(), INITIAL_SECRET);
  const [newKey, newKeyAction, regenerating] = useActionState(() => regenerateMitraApiKey(), INITIAL_SECRET);
  const [newSecret, newSecretAction, regeneratingSecret] = useActionState(
    () => regenerateMitraCallbackSecret(),
    INITIAL_SECRET,
  );

  const apiKey = newKey.apiKey ?? reveal.apiKey;
  const callbackSecret = newSecret.callbackSecret ?? reveal.callbackSecret;
  const error = reveal.error ?? newKey.error ?? newSecret.error;

  return (
    <div className="flex flex-col gap-4">
      <SecretRow label="Username" value={username} />

      {apiKey ? (
        <>
          <SecretRow label="API Key" value={apiKey} />
          {callbackSecret && <SecretRow label="Secret Callback" value={callbackSecret} />}
        </>
      ) : (
        <form action={revealAction}>
          <Button type="submit" size="sm" variant="outline" disabled={revealing}>
            <Eye className="size-4" aria-hidden="true" />
            {revealing ? "Membuka..." : "Tampilkan API Key & Secret"}
          </Button>
        </form>
      )}

      {(newKey.ok || newSecret.ok) && (
        <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {newKey.ok ?? newSecret.ok}
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
        <form action={newKeyAction}>
          <Button type="submit" size="sm" variant="outline" disabled={regenerating}>
            <RefreshCw className="size-4" aria-hidden="true" />
            {regenerating ? "Menerbitkan..." : "Terbitkan ulang API Key"}
          </Button>
        </form>
        <form action={newSecretAction}>
          <Button type="submit" size="sm" variant="outline" disabled={regeneratingSecret}>
            <RefreshCw className="size-4" aria-hidden="true" />
            {regeneratingSecret ? "Menerbitkan..." : hasCallbackSecret ? "Terbitkan ulang Secret Callback" : "Buat Secret Callback"}
          </Button>
        </form>
      </div>
      <p className="text-xs text-muted-foreground">
        Terbitkan ulang API key kalau kamu curiga key-nya bocor. Key lama <strong>langsung mati</strong> — integrasimu
        berhenti sampai key baru terpasang, jadi siapkan dulu akses ke file konfigurasimu sebelum menekan tombol itu.
      </p>
    </div>
  );
}

export function MitraConfigForm({
  callbackUrl,
  ipWhitelist,
}: {
  callbackUrl: string | null;
  ipWhitelist: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: MitraResult, formData: FormData) => updateMitraConfig(formData),
    INITIAL_RESULT,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="space-y-1.5">
        <Label htmlFor="callbackUrl">URL Callback</Label>
        <Input
          id="callbackUrl"
          name="callbackUrl"
          type="url"
          defaultValue={callbackUrl ?? ""}
          placeholder="https://server-anda.com/callback"
          maxLength={500}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          Kami POST ke alamat ini setiap kali transaksimu selesai. Kosongkan kalau kamu memilih cek status sendiri
          lewat endpoint status.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="serverIps">Whitelist IP</Label>
        <Input
          id="serverIps"
          name="serverIps"
          defaultValue={ipWhitelist ?? ""}
          placeholder="103.28.14.5, 103.28.14.6"
          maxLength={500}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          Pisahkan dengan koma, maksimal 10 alamat. <strong>Kosong = semua IP boleh memanggil</strong> — aman kalau
          server kamu berganti-ganti IP, tapi kurang ketat kalau IP-mu tetap.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Menyimpan..." : "Simpan Konfigurasi"}
        </Button>
        {(state.ok || state.error) && (
          <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
            {state.error ?? state.ok}
          </p>
        )}
      </div>
    </form>
  );
}
