"use client";

import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionMessage } from "@/components/action-feedback";
import { formatRupiah } from "@/lib/format";
import type { PaymentActions } from "@/lib/midtrans/client";

type ActionResult = { ok?: string; error?: string };
type BuyResult = { error?: string; purchaseId?: string; actions?: PaymentActions };

export interface TierOffer {
  id: string;
  name: string;
  badgeColor: string;
  discountPercent: number;
  benefits: string[];
  /** BigInt diserialkan sebagai string - Server Component tidak bisa mengirim BigInt ke client. */
  tierPrice: string;
  credit: string;
  payable: string;
  blockedReason: string | null;
  isCurrent: boolean;
}

function percent(bp: number): string {
  return `${(bp / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

export function ResellerStatus({
  email,
  account,
  pendingPurchase,
  offers,
  methods,
  buyAction,
  resendAction,
}: {
  email: string;
  account: {
    businessName: string;
    phone: string;
    referralCode: string | null;
    isActive: boolean;
    isActivated: boolean;
    tierName: string | null;
    tierColor: string | null;
    tierDiscountPercent: number;
  };
  pendingPurchase: { id: string; tierName: string; totalPaid: string; expiredAt: string | null } | null;
  offers: TierOffer[];
  methods: { code: string; label: string }[];
  buyAction: (prev: BuyResult | undefined, formData: FormData) => Promise<BuyResult>;
  resendAction: () => Promise<ActionResult>;
}) {
  const [buyState, buy, buying] = useActionState(buyAction, undefined as BuyResult | undefined);
  const [resendState, resend, resending] = useActionState(
    async () => resendAction(),
    undefined as ActionResult | undefined,
  );
  const [selected, setSelected] = useState<string | null>(null);

  // Belum aktivasi: tidak ada gunanya menampilkan paket sama sekali. Pembelian
  // memang ditolak server sampai akunnya aktif (lihat startTierPurchase), dan
  // memajang tombol yang pasti menolak cuma membuat orang mengira sistemnya rusak.
  if (!account.isActivated) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-medium">Tinggal satu langkah: aktivasi</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Kami sudah mengirim link aktivasi ke <strong className="text-foreground">{email}</strong>. Klik
            tombol di email itu untuk menyelesaikan pendaftaran. Link berlaku 30 menit.
          </p>
          <form action={resend} className="mt-3 flex items-center gap-3">
            <Button type="submit" variant="outline" size="sm" disabled={resending}>
              {resending ? "Mengirim..." : "Kirim ulang link"}
            </Button>
            <ActionMessage state={resendState ?? {}} />
          </form>
        </div>
        <AccountDetails account={account} />
      </div>
    );
  }

  if (!account.isActive) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <p className="text-sm font-medium text-destructive">Akun reseller dinonaktifkan</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Potongan harga tidak berlaku selama akun dinonaktifkan. Hubungi admin untuk mengaktifkannya lagi.
          </p>
        </div>
        <AccountDetails account={account} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Paket kamu sekarang</p>
            <p className="mt-0.5 flex items-center gap-2 text-lg font-semibold">
              {account.tierName ? (
                <span style={{ color: account.tierColor ?? undefined }}>{account.tierName}</span>
              ) : (
                "Gratis"
              )}
              <Badge variant="default">Reseller</Badge>
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {account.tierName
              ? `Potongan ${percent(account.tierDiscountPercent)} di setiap transaksi`
              : "Harga masih normal"}
          </p>
        </div>
        {account.tierName && (
          <p className="mt-3 text-xs text-muted-foreground">
            Paket berlaku <strong className="text-foreground">selamanya</strong> — tidak ada masa aktif dan
            tidak perlu diperpanjang.
          </p>
        )}
      </div>

      {pendingPurchase && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-medium">Menunggu pembayaran</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Paket {pendingPurchase.tierName} · {formatRupiah(BigInt(pendingPurchase.totalPaid))}. Selesaikan
            pembayarannya dulu — hanya satu pembelian bisa berjalan pada satu waktu.
          </p>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Naikkan paket</h2>
        {offers.length === 0 && (
          <p className="text-xs text-muted-foreground">Belum ada paket berbayar yang tersedia.</p>
        )}

        {offers.map((offer) => {
          const credit = BigInt(offer.credit);
          return (
            <div key={offer.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium" style={{ color: offer.badgeColor }}>
                  {offer.name}
                  {offer.isCurrent && <span className="ml-2 text-xs text-muted-foreground">(paket kamu)</span>}
                </p>
                <p className="text-sm font-semibold">{formatRupiah(BigInt(offer.tierPrice))}</p>
              </div>

              <p className="mt-1 text-xs text-muted-foreground">
                Potongan {percent(offer.discountPercent)}
                {offer.benefits.length > 0 && ` · ${offer.benefits.length} keuntungan tambahan`}
              </p>

              {/* Rincian kredit ditampilkan HANYA kalau ada. Menampilkan
                  "kredit Rp0" pada pembeli paket pertama cuma menimbulkan
                  pertanyaan tentang sesuatu yang tidak relevan baginya. */}
              {credit > 0n && !offer.blockedReason && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Harga paket {formatRupiah(BigInt(offer.tierPrice))} − kredit paket kamu sekarang{" "}
                  {formatRupiah(credit)} ={" "}
                  <strong className="text-foreground">{formatRupiah(BigInt(offer.payable))}</strong>
                </p>
              )}

              {offer.blockedReason ? (
                <p className="mt-3 text-xs text-muted-foreground">{offer.blockedReason}</p>
              ) : (
                <div className="mt-3">
                  {selected === offer.id ? (
                    <form action={buy} className="flex flex-wrap items-end gap-3">
                      <input type="hidden" name="tierId" value={offer.id} />
                      <div className="min-w-44 space-y-1.5">
                        <label htmlFor={`method-${offer.id}`} className="text-xs text-muted-foreground">
                          Metode pembayaran
                        </label>
                        <select
                          id={`method-${offer.id}`}
                          name="paymentMethod"
                          required
                          className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                        >
                          <option value="">Pilih metode...</option>
                          {methods.map((m) => (
                            <option key={m.code} value={m.code}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Button type="submit" disabled={buying || pendingPurchase !== null}>
                        {buying ? "Memproses..." : `Bayar ${formatRupiah(BigInt(offer.payable))}`}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setSelected(null)}>
                        Batal
                      </Button>
                    </form>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pendingPurchase !== null}
                      onClick={() => setSelected(offer.id)}
                    >
                      Ambil paket ini
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {buyState?.error && <ActionMessage state={{ error: buyState.error }} />}
        {buyState?.purchaseId && !buyState.error && (
          <p className="text-xs text-muted-foreground">
            Tagihan dibuat. Selesaikan pembayaran di jendela yang terbuka; paketmu menyala otomatis begitu
            pembayarannya masuk.
          </p>
        )}
      </div>

      <AccountDetails account={account} />
    </div>
  );
}

function AccountDetails({
  account,
}: {
  account: { businessName: string; phone: string; referralCode: string | null };
}) {
  return (
    <div className="rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Data usaha</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Nama usaha</dt>
          <dd className="text-right">{account.businessName}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">WhatsApp</dt>
          <dd className="text-right">{account.phone}</dd>
        </div>
        {account.referralCode && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Kode referral</dt>
            <dd className="text-right font-mono text-xs">{account.referralCode}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
