"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { PaymentInstructions } from "@/components/payment/payment-instructions";
import { formatRupiah } from "@/lib/format";
import type { PaymentActions } from "@/lib/midtrans/client";
import type { SnapBrowserConfig } from "@/lib/payment/gateway-config";
import type { PayJoinResult } from "@/app/actions/partner-application";

export interface JoinPaymentMethod {
  code: string;
  label: string;
}

/**
 * Pembayaran biaya join mitra.
 *
 * Instruksi bayarnya dirender dari data TERSIMPAN (joinRawResponse), bukan dari
 * hasil action - jadi menutup halaman lalu membukanya lagi tetap menampilkan
 * nomor VA / QR yang sama. Pola ini disalin dari halaman status deposit, dengan
 * alasan yang sama: tagihan yang cuma hidup di memori satu tab adalah tagihan
 * yang hilang begitu HP terkunci.
 */
export function JoinPaymentPanel({
  joinPrice,
  pendingTotal,
  pendingActions,
  qrDataUri,
  snapConfig,
  methods,
  action,
}: {
  joinPrice: bigint;
  /** Terisi kalau ada tagihan yang masih hidup. */
  pendingTotal: bigint | null;
  pendingActions: PaymentActions | null;
  qrDataUri: string | null;
  snapConfig: SnapBrowserConfig | null;
  methods: JoinPaymentMethod[];
  action: (prev: PayJoinResult | undefined, formData: FormData) => Promise<PayJoinResult>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  // Tagihan hidup: yang ditampilkan instruksinya, bukan tombol bayar lagi.
  if (pendingActions && pendingTotal !== null) {
    return (
      <div className="glass-card flex flex-col gap-4 rounded-2xl p-6">
        <div>
          <h2 className="font-heading text-base font-bold">Selesaikan pembayaran</h2>
          <p className="text-sm text-muted-foreground">
            Total <span className="font-semibold text-foreground">{formatRupiah(pendingTotal)}</span>.
            Akun mitramu terbit otomatis begitu pembayaran masuk — tidak perlu menunggu
            persetujuan siapa pun.
          </p>
        </div>
        <PaymentInstructions
          payment={pendingActions}
          qrDataUri={qrDataUri}
          snapConfig={snapConfig}
        />
      </div>
    );
  }

  return (
    <div className="glass-card flex flex-col gap-4 rounded-2xl p-6">
      <div>
        <h2 className="font-heading text-base font-bold">Biaya bergabung</h2>
        <p className="text-sm text-muted-foreground">
          Sekali bayar sebesar{" "}
          <span className="font-semibold text-foreground">
            {joinPrice > 0n ? formatRupiah(joinPrice) : "gratis"}
          </span>
          . Setelah lunas, kredensial API langsung terbit dan bisa kamu ambil di portal mitra.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-3">
        <label className="space-y-1">
          <span className="text-sm font-medium">Metode pembayaran</span>
          <select
            name="paymentMethod"
            required
            defaultValue=""
            className="block w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Pilih metode...
            </option>
            {methods.map((m) => (
              <option key={m.code} value={m.code}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

        <Button type="submit" size="lg" disabled={pending} className="self-start">
          {pending ? "Membuat tagihan..." : "Bayar & aktifkan"}
        </Button>
      </form>
    </div>
  );
}
