"use client";

import { useActionState, useState } from "react";
import { Copy, KeyRound, Plus, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { formatRupiah } from "@/lib/format";

type ActionResult = { ok?: string; error?: string };
type SecretResult = ActionResult & { username?: string; apiKey?: string; callbackSecret?: string };
const INITIAL_STATE: SecretResult = {};

export interface PartnerRow {
  id: string;
  username: string;
  email: string;
  name: string;
  banned: boolean;
  balance: number;
  tierName: string | null;
  discountPercent: number;
  callbackUrl: string | null;
  hasCallbackSecret: boolean;
  ipWhitelist: string | null;
  isActive: boolean;
  orderCount: number;
  lastUsedAt: string | null;
}

// Kredensial ditampilkan SEKALI lalu hilang bersama state komponen. Sengaja tidak
// ada tombol "lihat lagi": nilainya memang bisa didekripsi dari DB (skema md5
// menuntut itu), tapi menyediakan jalur membacanya lewat UI berarti satu sesi
// admin yang bocor = seluruh API key partner ikut bocor.
function SecretPanel({ result }: { result: SecretResult }) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!result.apiKey && !result.callbackSecret) return null;

  const fields = [
    result.username ? { label: "Username", value: result.username } : null,
    result.apiKey ? { label: "API Key", value: result.apiKey } : null,
    result.callbackSecret ? { label: "Secret Callback", value: result.callbackSecret } : null,
  ].filter((f): f is { label: string; value: string } => f !== null);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
        <TriangleAlert className="size-3.5" aria-hidden="true" />
        Salin sekarang — nilai ini tidak bisa ditampilkan lagi
      </div>
      <div className="flex flex-col gap-2">
        {fields.map((f) => (
          <div key={f.label} className="flex items-center gap-2">
            <span className="w-32 shrink-0 text-xs text-muted-foreground">{f.label}</span>
            <code className="min-w-0 flex-1 truncate rounded bg-foreground/10 px-2 py-1 font-mono text-xs">
              {f.value}
            </code>
            <Button type="button" size="xs" variant="outline" onClick={() => copy(f.value, f.label)}>
              <Copy aria-hidden="true" />
              {copied === f.label ? "Tersalin" : "Salin"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Alert({ state }: { state: ActionResult }) {
  if (!state.ok && !state.error) return null;
  return (
    <p className={`mt-2 text-xs ${state.error ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
      {state.error ?? state.ok}
    </p>
  );
}

function CreateForm({ action }: { action: (formData: FormData) => Promise<SecretResult> }) {
  const [state, formAction, pending] = useActionState(
    (_prev: SecretResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        Tambah Partner
      </Button>
    );
  }

  return (
    <form action={formAction} className="rounded-xl p-4 ring-1 ring-foreground/10">
      <h2 className="mb-3 text-sm font-semibold">Partner Baru</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="partner-email">Email akun partner</Label>
          <Input id="partner-email" name="email" type="email" required placeholder="partner@contoh.com" />
          <p className="text-xs text-muted-foreground">
            Akunnya harus sudah terdaftar lewat /register. Saldo & riwayat order menempel di akun ini.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="partner-username">Username API</Label>
          <Input id="partner-username" name="username" required placeholder="tokoabc" />
          <p className="text-xs text-muted-foreground">Huruf/angka/_/- saja — dipakai di dalam rumus signature.</p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="partner-callback">URL callback (opsional)</Label>
          <Input id="partner-callback" name="callbackUrl" placeholder="https://partner.com/callback" />
          <p className="text-xs text-muted-foreground">Kosongkan kalau partner memilih polling status sendiri.</p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="partner-ip">Whitelist IP (opsional)</Label>
          <Input id="partner-ip" name="ipWhitelist" placeholder="103.10.20.30, 103.10.20.31" />
          <p className="text-xs text-muted-foreground">Pisahkan dengan koma. Kosong = semua IP boleh memanggil.</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : "Buat Partner"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Batal
        </Button>
      </div>
      <Alert state={state} />
      <SecretPanel result={state} />
    </form>
  );
}

function PartnerCard({
  partner,
  updateAction,
  regenerateKeyAction,
  regenerateSecretAction,
}: {
  partner: PartnerRow;
  updateAction: (formData: FormData) => Promise<ActionResult>;
  regenerateKeyAction: (formData: FormData) => Promise<SecretResult>;
  regenerateSecretAction: (formData: FormData) => Promise<SecretResult>;
}) {
  const [updateState, updateFormAction, updating] = useActionState(
    (_prev: ActionResult, formData: FormData) => updateAction(formData),
    INITIAL_STATE as ActionResult,
  );
  const [keyState, keyFormAction, regenKeyPending] = useActionState(
    (_prev: SecretResult, formData: FormData) => regenerateKeyAction(formData),
    INITIAL_STATE,
  );
  const [secretState, secretFormAction, regenSecretPending] = useActionState(
    (_prev: SecretResult, formData: FormData) => regenerateSecretAction(formData),
    INITIAL_STATE,
  );

  return (
    <div className="rounded-xl p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold">{partner.username}</span>
            <Badge variant={partner.isActive && !partner.banned ? "success" : "muted"}>
              {partner.banned ? "Akun ditangguhkan" : partner.isActive ? "Aktif" : "Nonaktif"}
            </Badge>
            {partner.tierName && (
              <Badge variant="outline">
                {partner.tierName} · diskon {partner.discountPercent}%
              </Badge>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {partner.name} · {partner.email}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold">{formatRupiah(partner.balance)}</p>
          <p className="text-xs text-muted-foreground">
            {partner.orderCount} order ·{" "}
            {partner.lastUsedAt ? `terakhir dipakai ${new Date(partner.lastUsedAt).toLocaleDateString("id-ID")}` : "belum pernah dipakai"}
          </p>
        </div>
      </div>

      {!partner.tierName && (
        <p className="mt-2 rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
          Partner ini belum punya tier — harga yang diterimanya sama persis dengan harga jual publik (nol margin
          reseller). Beri tier lewat Admin → Kontrol User.
        </p>
      )}

      <form action={updateFormAction} className="mt-3 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="partnerId" value={partner.id} />
        <div className="flex flex-col gap-1">
          <Label htmlFor={`cb-${partner.id}`}>URL callback</Label>
          <Input
            id={`cb-${partner.id}`}
            name="callbackUrl"
            defaultValue={partner.callbackUrl ?? ""}
            placeholder="https://partner.com/callback"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`ip-${partner.id}`}>Whitelist IP</Label>
          <Input
            id={`ip-${partner.id}`}
            name="ipWhitelist"
            defaultValue={partner.ipWhitelist ?? ""}
            placeholder="Kosong = semua IP"
          />
        </div>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="isActive" defaultChecked={partner.isActive} />
            Aktif
          </label>
          <Button type="submit" size="sm" disabled={updating}>
            {updating ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      </form>
      <Alert state={updateState} />

      <div className="mt-3 flex flex-wrap gap-2 border-t border-foreground/10 pt-3">
        <form action={keyFormAction}>
          <input type="hidden" name="partnerId" value={partner.id} />
          <Button type="submit" size="sm" variant="destructive" disabled={regenKeyPending}>
            <KeyRound aria-hidden="true" />
            {regenKeyPending ? "Membuat…" : "Ganti API Key"}
          </Button>
        </form>
        <form action={secretFormAction}>
          <input type="hidden" name="partnerId" value={partner.id} />
          <Button type="submit" size="sm" variant="outline" disabled={regenSecretPending}>
            <RefreshCw aria-hidden="true" />
            {regenSecretPending ? "Membuat…" : partner.hasCallbackSecret ? "Ganti Secret Callback" : "Buat Secret Callback"}
          </Button>
        </form>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Mengganti API key langsung mematikan integrasi partner sampai mereka memasang key barunya.
      </p>
      <Alert state={keyState} />
      <SecretPanel result={keyState} />
      <Alert state={secretState} />
      <SecretPanel result={secretState} />
    </div>
  );
}

export function PartnersClient({
  partners,
  createAction,
  updateAction,
  regenerateKeyAction,
  regenerateSecretAction,
}: {
  partners: PartnerRow[];
  createAction: (formData: FormData) => Promise<SecretResult>;
  updateAction: (formData: FormData) => Promise<ActionResult>;
  regenerateKeyAction: (formData: FormData) => Promise<SecretResult>;
  regenerateSecretAction: (formData: FormData) => Promise<SecretResult>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <CreateForm action={createAction} />

      {partners.length === 0 ? (
        <p className="rounded-xl p-6 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
          Belum ada partner. Buat satu untuk mulai membuka akses API.
        </p>
      ) : (
        partners.map((p) => (
          <PartnerCard
            key={p.id}
            partner={p}
            updateAction={updateAction}
            regenerateKeyAction={regenerateKeyAction}
            regenerateSecretAction={regenerateSecretAction}
          />
        ))
      )}
    </div>
  );
}
