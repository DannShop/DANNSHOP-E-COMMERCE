"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { KeyRound, ShieldCheck, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionMessage } from "@/components/action-feedback";
import type { TwoFactorResult } from "@/app/actions/two-factor";

const INITIAL: TwoFactorResult = {};

/**
 * Panel pengaturan 2FA — dipakai admin maupun member.
 *
 * Satu komponen untuk keduanya karena alurnya identik; yang berbeda cuma boleh
 * atau tidaknya dimatikan, dan itu ditentukan server (lihat
 * disableTwoFactorAction), bukan disembunyikan di UI. Menyembunyikan tombolnya
 * saja tidak menutup apa pun.
 */
export function TwoFactorPanel({
  enabled,
  recoveryLeft,
  canDisable,
  startSetup,
  confirmSetup,
  disableAction,
}: {
  enabled: boolean;
  recoveryLeft: number;
  canDisable: boolean;
  startSetup: () => Promise<TwoFactorResult>;
  confirmSetup: (formData: FormData) => Promise<TwoFactorResult>;
  disableAction: (formData: FormData) => Promise<TwoFactorResult>;
}) {
  const [setup, setSetup] = useState<TwoFactorResult["setup"] | null>(null);
  const [starting, setStarting] = useState(false);
  const [confirmState, confirmFormAction, confirmPending] = useActionState(
    (_prev: TwoFactorResult, formData: FormData) => confirmSetup(formData),
    INITIAL,
  );
  const [disableState, disableFormAction, disablePending] = useActionState(
    (_prev: TwoFactorResult, formData: FormData) => disableAction(formData),
    INITIAL,
  );

  async function begin() {
    setStarting(true);
    try {
      const result = await startSetup();
      setSetup(result.setup ?? null);
    } finally {
      setStarting(false);
    }
  }

  const codes = confirmState.recoveryCodes;

  return (
    <div className="space-y-4 rounded-xl p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium">
          {enabled ? (
            <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          ) : (
            <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          )}
          Autentikasi dua faktor
        </p>
        <Badge variant={enabled ? "success" : "warning"}>{enabled ? "Aktif" : "Belum aktif"}</Badge>
      </div>

      {enabled && !codes && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Login akan meminta kode dari aplikasi autentikator kamu.{" "}
            <strong>{recoveryLeft} kode pemulihan</strong> masih tersisa.
          </p>
          {recoveryLeft <= 2 && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              Kode pemulihanmu hampir habis. Daftarkan ulang perangkat untuk menerbitkan delapan kode baru — kode lama
              otomatis hangus.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={begin} disabled={starting}>
              <KeyRound className="size-4" aria-hidden="true" />
              {starting ? "Menyiapkan..." : "Daftarkan ulang perangkat"}
            </Button>
          </div>
        </div>
      )}

      {!enabled && !setup && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Menambah satu lapisan di atas password: walau passwordmu bocor, tanpa kode dari HP-mu akun ini tetap tidak
            bisa dimasuki.
          </p>
          <Button type="button" size="sm" onClick={begin} disabled={starting}>
            <KeyRound className="size-4" aria-hidden="true" />
            {starting ? "Menyiapkan..." : "Aktifkan 2FA"}
          </Button>
        </div>
      )}

      {setup && !codes && (
        <div className="space-y-3 rounded-lg border border-dashed p-3">
          <p className="text-sm font-medium">1. Pindai QR ini dengan aplikasi autentikator</p>
          <p className="text-xs text-muted-foreground">
            Google Authenticator, Authy, 1Password, atau aplikasi TOTP mana pun.
          </p>
          <Image
            src={setup.qrDataUrl}
            alt="Kode QR untuk aplikasi autentikator"
            width={220}
            height={220}
            unoptimized
            className="rounded-lg bg-white p-2"
          />
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Tidak bisa memindai? Masukkan kode ini manual</summary>
            <code className="mt-1 block font-mono break-all">{setup.secret}</code>
          </details>

          <form action={confirmFormAction} className="space-y-2 border-t pt-3">
            <Label htmlFor="totp-confirm">2. Masukkan kode yang muncul di aplikasi</Label>
            <Input
              id="totp-confirm"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              className="max-w-40 font-mono tracking-widest"
              required
            />
            <p className="text-xs text-muted-foreground">
              2FA baru menyala setelah kode ini cocok — jadi kamu tidak akan terkunci di luar kalau aplikasinya ternyata
              belum terpasang benar.
            </p>
            <Button type="submit" size="sm" disabled={confirmPending}>
              {confirmPending ? "Memeriksa..." : "Aktifkan"}
            </Button>
            <ActionMessage state={confirmState} />
          </form>
        </div>
      )}

      {codes && (
        <div className="space-y-2 rounded-lg border-2 border-amber-500/50 bg-amber-500/10 p-3">
          <p className="text-sm font-semibold">Simpan kode pemulihan ini sekarang</p>
          <p className="text-xs text-muted-foreground">
            Dipakai kalau kamu kehilangan aplikasi autentikator. Masing-masing hanya berlaku sekali, dan{" "}
            <strong>tidak akan pernah ditampilkan lagi</strong> setelah halaman ini ditutup.
          </p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-sm">
            {codes.map((c) => (
              <li key={c} className="rounded bg-background px-2 py-1">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {enabled && canDisable && !codes && (
        <form action={disableFormAction} className="space-y-2 border-t pt-3">
          <Label htmlFor="disable-password" className="text-xs">
            Matikan 2FA (masukkan password)
          </Label>
          <Input id="disable-password" name="password" type="password" autoComplete="current-password" className="max-w-64" />
          <Button type="submit" size="sm" variant="destructive" disabled={disablePending}>
            {disablePending ? "Memproses..." : "Matikan 2FA"}
          </Button>
          <ActionMessage state={disableState} />
        </form>
      )}

      {enabled && !canDisable && (
        <p className="border-t pt-3 text-xs text-muted-foreground">
          Akun admin wajib memakai 2FA, jadi ini tidak bisa dimatikan. Kalau kehilangan aplikasi autentikator, pakai
          salah satu kode pemulihan untuk masuk lalu daftarkan ulang perangkatmu.
        </p>
      )}
    </div>
  );
}
