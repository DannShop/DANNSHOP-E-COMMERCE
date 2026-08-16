"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { QrCode, ScanSearch, Wallet, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TrustBadges } from "@/components/trust-badges";
import { createCheckoutOrder, type CheckoutResult } from "@/app/actions/checkout";
import { checkGameId } from "@/app/actions/id-check";
import { hasSufficientBalance } from "@/lib/wallet/decisions";
import { VoucherField, type AppliedVoucherState } from "./voucher-field";
import type { ProductForCheckout } from "@/lib/catalog/public";

type Item = ProductForCheckout["items"][number];

const INITIAL_STATE: CheckoutResult = {};

function withPrevState(action: typeof createCheckoutOrder) {
  return (_prev: CheckoutResult, formData: FormData) => action(formData);
}

function formatRupiah(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(amount),
  );
}

function StepHeader({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary font-heading text-sm font-bold text-primary-foreground">
        {n}
      </span>
      <h2 className="font-heading text-base font-bold">{title}</h2>
    </div>
  );
}

interface NominalSection {
  key: string;
  title: string | null; // null = tanpa judul (ungrouped)
  isFlash: boolean;
  items: Item[];
}

// Flash sale ditarik keluar dari grup asalnya ke section paling atas (satu
// item cuma tampil sekali). Sisanya dikelompokkan per grup sesuai urutan
// admin (groupSortOrder); item tanpa grup jadi section terakhir tanpa judul,
// bukan hilang dari daftar. Urutan item DI DALAM tiap section sudah
// harga-termurah-dulu dari server, dipertahankan apa adanya di sini.
function buildSections(items: Item[]): NominalSection[] {
  const flashItems = items.filter((i) => i.isFlashActive);
  const rest = items.filter((i) => !i.isFlashActive);

  const groupOrder = new Map<string, number>();
  const groupedItems = new Map<string, Item[]>();
  const ungrouped: Item[] = [];
  for (const item of rest) {
    if (item.groupName === null) {
      ungrouped.push(item);
      continue;
    }
    if (!groupedItems.has(item.groupName)) {
      groupedItems.set(item.groupName, []);
      groupOrder.set(item.groupName, item.groupSortOrder ?? 0);
    }
    groupedItems.get(item.groupName)!.push(item);
  }

  const sections: NominalSection[] = [];
  if (flashItems.length > 0) {
    sections.push({ key: "__flash__", title: "Flash Sale", isFlash: true, items: flashItems });
  }
  const sortedGroupNames = Array.from(groupedItems.keys()).sort(
    (a, b) => (groupOrder.get(a) ?? 0) - (groupOrder.get(b) ?? 0),
  );
  for (const name of sortedGroupNames) {
    sections.push({ key: name, title: name, isFlash: false, items: groupedItems.get(name)! });
  }
  if (ungrouped.length > 0) {
    sections.push({ key: "__ungrouped__", title: null, isFlash: false, items: ungrouped });
  }
  return sections;
}

function NominalButton({
  item,
  selected,
  showOriginGroup,
  onSelect,
}: {
  item: Item;
  selected: boolean;
  showOriginGroup: boolean;
  onSelect: () => void;
}) {
  const hasDiscount = item.effectivePrice !== item.sellingPrice;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex flex-col gap-1 overflow-hidden rounded-[var(--radius)] border-2 p-3 text-left transition-colors ${
        selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-xs font-medium text-primary">
          <Zap className="size-3" aria-hidden="true" />
          Instan
        </span>
        {item.isFlashActive && (
          <Badge variant="warning" className="text-[10px]">
            Flash
          </Badge>
        )}
      </div>
      <span className="text-sm font-medium">{item.name}</span>
      {showOriginGroup && item.groupName && (
        <span className="text-[11px] text-muted-foreground">{item.groupName}</span>
      )}
      <div className="flex items-baseline gap-2">
        <span className="font-heading text-base font-bold">{formatRupiah(item.effectivePrice)}</span>
        {hasDiscount && (
          <span className="text-xs text-muted-foreground line-through">{formatRupiah(item.sellingPrice)}</span>
        )}
      </div>
      {item.description && (
        <span className="text-[11px] leading-snug text-muted-foreground">{item.description}</span>
      )}
      {/* Sisa stok hanya disebut saat benar-benar menipis. Menuliskan "sisa 940"
          tidak memberi tahu pembeli apa pun; yang mengubah keputusannya adalah
          tahu bahwa tinggal sedikit. Item tak terbatas (null) tidak pernah
          menampilkan apa pun. */}
      {item.stockLeft !== null && item.stockLeft <= 5 && (
        <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
          Sisa {item.stockLeft}
        </span>
      )}
    </button>
  );
}

export interface CheckoutPricingContext {
  /** Benefit tier: fee order dibebaskan. */
  freeFee: boolean;
  /** Benefit tier: kode unik order dibebaskan. */
  noUniqueCode: boolean;
  uniqueCodeMin: number;
  uniqueCodeMax: number;
  /** Aturan global admin (lib/payment/rules.ts). */
  feeEnabled: boolean;
  uniqueCodeEnabled: boolean;
}

export function ProductDetailClient({
  product,
  session,
  paymentMethods,
  pricing,
  checkoutNoteHtml,
}: {
  product: ProductForCheckout;
  session: { email: string; walletBalance: bigint } | null;
  paymentMethods: { code: string; label: string; logoUrl: string | null; feeFlat: string; feePercent: number }[];
  pricing: CheckoutPricingContext;
  /** Slot HTML admin - SUDAH tersaring daftar-izin di lib/storefront/appearance.ts. */
  checkoutNoteHtml: string;
}) {
  const purchasableItems = product.items.filter((i) => i.purchasable);
  const [selectedItemId, setSelectedItemId] = useState(purchasableItems[0]?.id ?? "");
  const [selectedMethod, setSelectedMethod] = useState(paymentMethods[0]?.code ?? "");
  const selectedItem = purchasableItems.find((i) => i.id === selectedItemId) ?? purchasableItems[0];
  const sections = buildSections(purchasableItems);

  const router = useRouter();
  const [state, formAction, pending] = useActionState(withPrevState(createCheckoutOrder), INITIAL_STATE);

  // Nilai field jadi state terkendali (sebelumnya uncontrolled) karena cek ID
  // perlu membacanya sebelum form dikirim. Form tetap mengirimkannya lewat
  // atribut `name` seperti biasa - alur checkout tidak berubah sama sekali.
  const [targetValues, setTargetValues] = useState<Record<string, string>>({});
  const [voucher, setVoucher] = useState<AppliedVoucherState | null>(null);

  // Voucher DILEPAS begitu item yang dipilih berganti. Potongannya dihitung
  // server untuk harga item TERTENTU - voucher persentase pada item Rp10.000
  // memberi angka yang berbeda dari item Rp500.000, dan membiarkan angka lama
  // menempel berarti rincian pembayaran menjanjikan potongan yang tidak akan
  // diberikan server.
  //
  // Pola "menyesuaikan state saat render" (bukan useEffect) sesuai anjuran
  // resmi React, sama seperti penutupan drawer di AdminShell. Letaknya WAJIB
  // di antara hook lain dan SEBELUM early return di bawah - versi pertama
  // menaruhnya setelah early return "produk habis", yang membuat jumlah hook
  // berbeda antar render.
  const [lastItemId, setLastItemId] = useState(selectedItemId);
  if (lastItemId !== selectedItemId) {
    setLastItemId(selectedItemId);
    setVoucher(null);
  }
  const [idCheck, setIdCheck] = useState<{ nickname?: string; error?: string } | null>(null);
  const [checkingId, startIdCheck] = useTransition();
  const allTargetsFilled = product.inputFields.every((f) => (targetValues[f.name] ?? "").trim() !== "");

  function runIdCheck() {
    startIdCheck(async () => {
      setIdCheck(null);
      setIdCheck(await checkGameId(product.id, targetValues));
    });
  }

  useEffect(() => {
    if (state.publicToken) router.push(`/invoice/${state.publicToken}`);
  }, [state.publicToken, router]);

  if (purchasableItems.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border bg-card p-6 text-center text-muted-foreground">
        {product.name} sedang tidak tersedia untuk dibeli saat ini.
      </div>
    );
  }

  // Harga item setelah potongan promo. Semua angka di bawah memakai ini, bukan
  // effectivePrice mentah - termasuk cek kecukupan saldo, supaya tombol bayar
  // saldo tidak mati untuk pesanan yang justru sudah terjangkau berkat promo.
  const itemPrice = selectedItem?.effectivePrice ?? 0n;
  const voucherDiscount = voucher?.discount ?? 0n;
  const netItemPrice = itemPrice > voucherDiscount ? itemPrice - voucherDiscount : 0n;

  const canPayWithBalance = session ? hasSufficientBalance(session.walletBalance, netItemPrice) : false;

  // Preview "Total Bayar" harus ikut fee metode pembayaran yang lagi
  // dipilih (bukan cuma effectivePrice) - fee final tetap dihitung ulang
  // otoritatif di server (createCheckoutOrder), ini murni tampilan supaya
  // tidak menyesatkan dibanding breakdown fee yang sudah ada di tiap baris
  // metode. Kode unik (Rp1-999) sengaja tidak diikutkan ke angka karena
  // di-generate acak di server, bukan bisa diprediksi di client.
  const isBalanceSelected = Boolean(session) && selectedMethod === "balance";
  const selectedMethodConfig = paymentMethods.find((m) => m.code === selectedMethod);
  // Fee bisa nol karena DUA sebab berbeda: admin mematikannya global
  // (rules.feeOrder) atau benefit tier member (free_order_fee). Keduanya
  // dievaluasi otoritatif di server; di sini cuma supaya angkanya sama.
  const feeWaived = pricing.freeFee;
  const feeApplies = pricing.feeEnabled && !feeWaived;
  const uniqueCodeApplies = pricing.uniqueCodeEnabled && !pricing.noUniqueCode;
  // Fee dihitung dari harga SETELAH potongan promo - cermin persis dari
  // createMidtransOrder di server.
  const previewFee =
    selectedItem && selectedMethodConfig && !isBalanceSelected && feeApplies
      ? (netItemPrice * BigInt(selectedMethodConfig.feePercent)) / 10_000n + BigInt(selectedMethodConfig.feeFlat)
      : 0n;
  const previewTotal = selectedItem ? netItemPrice + previewFee : 0n;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        {product.banner && (
          <div className="relative aspect-21/9 w-full overflow-hidden rounded-[var(--radius)] bg-gradient-to-br from-primary to-accent">
            <Image
              src={product.banner}
              alt={product.name}
              fill
              sizes="(min-width: 1024px) 672px, 100vw"
              className="object-cover"
              unoptimized
            />
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent" />
          </div>
        )}

        <div className="relative flex items-end gap-3 px-1">
          <div
            className={`relative z-10 size-16 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-primary to-accent ring-4 ring-background ${product.banner ? "-mt-8" : ""}`}
          >
            {(product.iconUrl ?? product.banner) && (
              <Image src={(product.iconUrl ?? product.banner)!} alt="" fill sizes="64px" className="object-cover" unoptimized />
            )}
          </div>
          <div className="pb-1">
            <h1 className="font-heading text-2xl font-bold text-balance">{product.name}</h1>
            {product.publisher && <p className="text-sm text-muted-foreground">{product.publisher}</p>}
          </div>
        </div>
      </div>

      <TrustBadges />

      <form action={formAction} className="flex flex-col gap-6 rounded-[var(--radius)] border bg-card p-5">
        <input type="hidden" name="productItemId" value={selectedItemId} />

        <div className="flex flex-col gap-3">
          <StepHeader n={1} title="Masukkan Data Akun" />
          {product.inputFields.map((field) => (
            <div key={field.name} className="flex flex-col gap-2">
              <Label htmlFor={`target-${field.name}`}>{field.label}</Label>
              <Input
                id={`target-${field.name}`}
                name={`target.${field.name}`}
                required
                className="h-11 text-base"
                value={targetValues[field.name] ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  setTargetValues((prev) => ({ ...prev, [field.name]: value }));
                  // Hasil cek yang lama dibuang begitu datanya diubah - nickname
                  // yang tertinggal di layar untuk ID yang sudah bukan itu lagi
                  // justru meyakinkan pembeli bahwa ID barunya sudah benar.
                  setIdCheck(null);
                }}
              />
            </div>
          ))}

          {product.idCheckEnabled && (
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={checkingId || !allTargetsFilled}
                onClick={runIdCheck}
                className="self-start"
              >
                <ScanSearch className="size-4" aria-hidden="true" />
                {checkingId ? "Mengecek..." : "Cek ID"}
              </Button>
              {idCheck && (
                <p
                  aria-live="polite"
                  className={`rounded-md px-3 py-2 text-sm ${
                    idCheck.nickname
                      ? "bg-success text-success-foreground"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {idCheck.nickname ? `Akun ditemukan: ${idCheck.nickname}` : idCheck.error}
                </p>
              )}
            </div>
          )}
        </div>

        {product.fulfillmentMode === "MANUAL" && (
          <div className="rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-sm">
            <strong>Produk ini dikirim manual oleh admin.</strong> Setelah pembayaran berhasil, kamu akan diarahkan
            untuk konfirmasi ke admin — pengirimannya tidak otomatis dalam hitungan detik seperti produk topup biasa.
          </div>
        )}

        <div className="flex flex-col gap-4 border-t pt-6">
          <StepHeader n={2} title="Pilih Nominal" />
          {sections.map((section) => (
            <div key={section.key} className="flex flex-col gap-2">
              {section.title && (
                <p
                  className={`text-xs font-semibold uppercase tracking-wide ${section.isFlash ? "flex items-center gap-1 text-warning-foreground" : "text-muted-foreground"}`}
                >
                  {section.isFlash && <Zap className="size-3.5" aria-hidden="true" />}
                  {section.title}
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {section.items.map((item) => (
                  <NominalButton
                    key={item.id}
                    item={item}
                    selected={item.id === selectedItemId}
                    showOriginGroup={section.isFlash}
                    onSelect={() => setSelectedItemId(item.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t pt-6">
          <StepHeader n={3} title="Pilih Pembayaran" />
          <input
            type="hidden"
            name="paymentMethod"
            value={session && selectedMethod === "balance" ? "balance" : selectedMethod}
          />
          <RadioGroup value={selectedMethod} onValueChange={setSelectedMethod}>
            {paymentMethods.map((m) => {
              const feeBp = m.feePercent;
              // Ikut feeApplies juga - kalau tidak, member ber-benefit
              // free_order_fee melihat "+ Rp350" di sini tapi "Gratis" di
              // rincian bawah, dua angka berbeda untuk hal yang sama.
              const fee =
                selectedItem && feeApplies
                  ? (selectedItem.effectivePrice * BigInt(feeBp)) / 10_000n + BigInt(m.feeFlat)
                  : 0n;
              return (
                <RadioGroupItem key={m.code} value={m.code}>
                  {m.logoUrl ? (
                    <span className="relative h-6 w-11 shrink-0">
                      <Image src={m.logoUrl} alt="" fill sizes="44px" className="object-contain" unoptimized />
                    </span>
                  ) : (
                    <QrCode className="size-4" aria-hidden="true" />
                  )}
                  {m.label}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {fee > 0n ? `+ ${formatRupiah(fee)}` : "Gratis"}
                  </span>
                </RadioGroupItem>
              );
            })}
            {session && (
              <RadioGroupItem value="balance" disabled={!canPayWithBalance}>
                <Wallet className="size-4" aria-hidden="true" />
                Saldo ({formatRupiah(session.walletBalance)})
              </RadioGroupItem>
            )}
          </RadioGroup>
          {session && !canPayWithBalance && (
            <p className="text-xs text-muted-foreground">
              Saldo tidak cukup.{" "}
              <Link href="/account/deposit" className="text-primary underline">
                Isi saldo dulu
              </Link>
              .
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t pt-6">
          <StepHeader n={4} title="Detail Kontak" />
          <div className="flex flex-col gap-2">
            <Label htmlFor="buyerEmail">Email (untuk akses invoice)</Label>
            <Input
              id="buyerEmail"
              name="buyerEmail"
              type="email"
              required
              defaultValue={session?.email ?? undefined}
              className="h-11 text-base"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="buyerPhone">Nomor WhatsApp (opsional)</Label>
            <Input
              id="buyerPhone"
              name="buyerPhone"
              type="tel"
              placeholder="08xxxxxxxxxx"
              className="h-11 text-base"
            />
            <p className="text-xs text-muted-foreground">Dipakai CS untuk menghubungi Anda kalau ada kendala pesanan.</p>
          </div>

          {/* Kode promo ditaruh SETELAH data akun & item terpilih, bukan di
              awal: potongannya bergantung pada item mana yang dipilih dan pada
              nomor tujuan (batas pemakaian dihitung per tujuan), jadi mengisi
              kode sebelum keduanya ada cuma menghasilkan penolakan. */}
          {selectedItem && (
            <VoucherField
              productItemId={selectedItem.id}
              targetValues={targetValues}
              applied={voucher}
              onApplied={setVoucher}
            />
          )}
        </div>

        {selectedItem && (
          <div className="flex flex-col gap-2 rounded-[var(--radius)] border bg-muted/50 p-4">
            <p className="font-heading text-sm font-bold">Rincian Pembayaran</p>
            <div className="flex justify-between gap-3 text-sm">
              <span className="min-w-0 text-muted-foreground">{selectedItem.name}</span>
              <span className="shrink-0 font-medium">{formatRupiah(selectedItem.effectivePrice)}</span>
            </div>
            {voucher && (
              <div className="flex justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-muted-foreground">Promo {voucher.code}</span>
                <span className="shrink-0 font-medium text-primary">
                  −{formatRupiah(voucher.discount)}
                </span>
              </div>
            )}
            {!isBalanceSelected && (
              <>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="min-w-0 text-muted-foreground">
                    Fee {selectedMethodConfig?.label ?? "pembayaran"}
                    {feeWaived && <span className="ml-1 text-primary">(gratis, benefit member)</span>}
                  </span>
                  <span className="shrink-0 font-medium">
                    {previewFee > 0n ? formatRupiah(previewFee) : formatRupiah(0n)}
                  </span>
                </div>
                {uniqueCodeApplies && (
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="min-w-0 text-muted-foreground">Kode unik</span>
                    <span className="shrink-0 font-medium">
                      Rp{pricing.uniqueCodeMin}–{pricing.uniqueCodeMax}
                    </span>
                  </div>
                )}
              </>
            )}
            <div className="mt-1 flex items-baseline justify-between gap-3 border-t pt-2">
              <span className="text-sm font-medium">Total Bayar</span>
              <span className="font-heading text-2xl font-bold text-primary">
                {formatRupiah(previewTotal)}
                {uniqueCodeApplies && !isBalanceSelected && <span className="text-base">+</span>}
              </span>
            </div>
            {uniqueCodeApplies && !isBalanceSelected && (
              // Kode unik di-generate acak di SERVER saat order dibuat, jadi
              // angka pastinya memang belum ada di sini. Ditampilkan jujur
              // sebagai rentang alih-alih ditebak atau disembunyikan.
              <p className="text-xs text-muted-foreground">
                Kode unik ditentukan saat pesanan dibuat — nominal pastinya muncul di halaman invoice.
              </p>
            )}
          </div>
        )}

        {/* Slot HTML admin. Sudah disaring daftar-izin dua kali di lapisan
            appearance (saat disimpan & saat dibaca) - lihat catatan panjang di
            lib/storefront/sanitize-html.ts kenapa penyaringan itu wajib untuk
            markup yang tampil satu halaman dengan tombol pembayaran. */}
        {checkoutNoteHtml && (
          <div className="storefront-slot text-sm" dangerouslySetInnerHTML={{ __html: checkoutNoteHtml }} />
        )}

        {state.error && <p className="text-sm text-danger-foreground">{state.error}</p>}
        <Button
          type="submit"
          disabled={pending || Boolean(state.publicToken)}
          className="h-11 w-full text-base font-heading"
        >
          {pending ? "Memproses..." : "Beli Sekarang"}
        </Button>
      </form>
    </div>
  );
}
