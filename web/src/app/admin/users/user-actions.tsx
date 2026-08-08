"use client";

import { useActionState, useState } from "react";
import { ShieldOff, ShieldCheck, KeyRound, Copy, Check, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult, ResetPasswordResult } from "@/app/actions/admin-users";

const INITIAL: ActionResult = {};
const INITIAL_RESET: ResetPasswordResult = {};

function Message({ state }: { state: ActionResult }) {
  if (!state.ok && !state.error) return null;
  return (
    <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
      {state.error ?? state.ok}
    </p>
  );
}

/** Password hasil reset cuma ada di memori halaman ini - begitu ditutup, hilang. */
function GeneratedPassword({ password }: { password: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard bisa ditolak browser (halaman tidak fokus / izin dicabut).
      // Passwordnya tetap terbaca di layar, jadi tidak ada yang perlu dipulihkan.
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
        Password ini cuma ditampilkan sekali
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded border bg-background px-2 py-1.5 font-mono text-sm break-all">
          {password}
        </code>
        <Button type="button" size="sm" variant="outline" onClick={copy} className="shrink-0">
          {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
          <span className="ml-1.5">{copied ? "Tersalin" : "Salin"}</span>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Kirim ke pemilik akun lewat jalur yang kamu percaya, lalu minta dia menggantinya sendiri di
        Akun Saya. Menutup atau memuat ulang halaman ini akan menghilangkannya permanen.
      </p>
    </div>
  );
}

export function UserActions({
  user,
  banAction,
  unbanAction,
  resetPasswordAction,
}: {
  user: { id: string; email: string; role: string; bannedAt: string | null; banReason: string | null };
  banAction: (formData: FormData) => Promise<ActionResult>;
  unbanAction: (formData: FormData) => Promise<ActionResult>;
  resetPasswordAction: (formData: FormData) => Promise<ResetPasswordResult>;
}) {
  const [banState, banFormAction, banPending] = useActionState(
    (_prev: ActionResult, formData: FormData) => banAction(formData),
    INITIAL,
  );
  const [unbanState, unbanFormAction, unbanPending] = useActionState(
    (_prev: ActionResult, formData: FormData) => unbanAction(formData),
    INITIAL,
  );
  const [resetState, resetFormAction, resetPending] = useActionState(
    (_prev: ResetPasswordResult, formData: FormData) => resetPasswordAction(formData),
    INITIAL_RESET,
  );

  // Akun admin sengaja tidak bisa ditangguhkan/direset dari panel (server
  // action menolaknya juga) - tombolnya disembunyikan supaya admin tidak
  // menekan sesuatu yang pasti gagal.
  const isAdmin = user.role === "ADMIN";
  const isBanned = user.bannedAt !== null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div>
        <h2 className="font-heading text-sm font-bold">Keamanan Akun</h2>
        <p className="text-xs text-muted-foreground">
          Penangguhan berlaku langsung di semua jalur transaksi, tidak menunggu sesi user habis.
        </p>
      </div>

      {isAdmin ? (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Ini akun admin. Penangguhan dan reset password lewat panel dimatikan supaya satu sesi admin
          yang bocor tidak bisa mengunci atau mengambil alih tim admin lainnya. Gunakan alur
          &quot;lupa password&quot; biasa.
        </p>
      ) : (
        <>
          {/* ===== Tangguhkan / cabut ===== */}
          {isBanned ? (
            <form action={unbanFormAction} className="space-y-2">
              <input type="hidden" name="userId" value={user.id} />
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-xs font-semibold text-destructive">Akun ditangguhkan</p>
                {user.banReason && (
                  <p className="mt-1 text-xs text-muted-foreground">Alasan: {user.banReason}</p>
                )}
              </div>
              <Button type="submit" size="sm" variant="outline" disabled={unbanPending}>
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                <span className="ml-1.5">{unbanPending ? "Memproses..." : "Cabut Penangguhan"}</span>
              </Button>
              <Message state={unbanState} />
            </form>
          ) : (
            <form
              action={banFormAction}
              onSubmit={(e) => {
                if (!window.confirm(`Tangguhkan akun ${user.email}? Dia langsung tidak bisa checkout, isi saldo, atau beli tier.`)) {
                  e.preventDefault();
                }
              }}
              className="space-y-2"
            >
              <input type="hidden" name="userId" value={user.id} />
              <div className="space-y-1.5">
                <Label htmlFor="ban-reason" className="text-xs">Alasan (opsional, ditampilkan ke user)</Label>
                <Input id="ban-reason" name="reason" maxLength={500} placeholder="mis. indikasi chargeback berulang" />
              </div>
              <Button type="submit" size="sm" variant="destructive" disabled={banPending}>
                <ShieldOff className="size-3.5" aria-hidden="true" />
                <span className="ml-1.5">{banPending ? "Memproses..." : "Tangguhkan Akun"}</span>
              </Button>
              <Message state={banState} />
            </form>
          )}

          {/* ===== Reset password ===== */}
          <form
            action={resetFormAction}
            onSubmit={(e) => {
              if (!window.confirm(`Reset password ${user.email}? Password lamanya langsung tidak berlaku dan semua sesi yang sedang berjalan diputus.`)) {
                e.preventDefault();
              }
            }}
            className="space-y-2 border-t pt-4"
          >
            <input type="hidden" name="userId" value={user.id} />
            <p className="text-xs text-muted-foreground">
              Membuat password acak 16 karakter. Dipakai kalau customer kehilangan akses ke emailnya
              sehingga alur &quot;lupa password&quot; tidak bisa dijalankan.
            </p>
            <Button type="submit" size="sm" variant="outline" disabled={resetPending}>
              <KeyRound className="size-3.5" aria-hidden="true" />
              <span className="ml-1.5">{resetPending ? "Memproses..." : "Reset Password"}</span>
            </Button>
            {resetState.error && <p className="text-xs text-destructive">{resetState.error}</p>}
            {resetState.password && <GeneratedPassword password={resetState.password} />}
          </form>
        </>
      )}
    </div>
  );
}
