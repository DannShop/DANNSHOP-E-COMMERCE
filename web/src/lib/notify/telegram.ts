import {
  getTelegramNotifyConfig,
  type TelegramCredentials,
  type TelegramEvent,
} from "@/lib/notify/telegram-config";

/** @deprecated Nama lama - dipertahankan supaya import lama tidak putus. */
export type TelegramConfig = TelegramCredentials;

function baseUrlOrEmpty(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "";
}

function formatRupiah(amount: bigint | number): string {
  return `Rp ${Number(amount).toLocaleString("id-ID")}`;
}

export function formatOrderAlertMessage(
  params: { orderNumber: string; status: string; reason: string },
  baseUrl: string = baseUrlOrEmpty(),
): string {
  return `⚠️ Order ${params.orderNumber} → ${params.status}\n${params.reason}\n${baseUrl}/admin/orders/${params.orderNumber}`;
}

// Notifikasi kegagalan fulfillment - TERMASUK yang sudah berhasil auto-refund.
//
// Sebelumnya alert Telegram HANYA dikirim lewat escalateOrder(), yaitu ketika
// order jatuh ke NEEDS_REVIEW/REFUND_PENDING. Akibatnya kasus yang paling
// sering terjadi - order member gagal lalu di-refund otomatis - berlalu tanpa
// satu pun notifikasi: uang pelanggan kembali, tapi admin tidak pernah tahu
// ada produk yang tidak terkirim. Kalau penyebabnya sistemik (saldo provider
// habis, IP belum di-whitelist), SELURUH order berikutnya ikut gagal diam-diam.
export function formatFulfillmentFailureMessage(
  params: {
    orderNumber: string;
    productName: string;
    itemName: string;
    providerMessage: string;
    diagnosisLabel: string;
    diagnosisAction: string;
    refunded: "wallet" | "manual";
  },
  baseUrl: string = baseUrlOrEmpty(),
): string {
  const refundLine =
    params.refunded === "wallet"
      ? "Dana sudah dikembalikan otomatis ke saldo pembeli."
      : "Pembeli tamu - refund perlu diproses manual.";
  return [
    `❌ Order ${params.orderNumber} gagal diproses`,
    `${params.productName} · ${params.itemName}`,
    ``,
    `Sebab: ${params.diagnosisLabel}`,
    `Pesan provider: ${params.providerMessage || "-"}`,
    params.diagnosisAction ? `Tindakan: ${params.diagnosisAction}` : "",
    ``,
    refundLine,
    `${baseUrl}/admin/orders/${params.orderNumber}`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function formatBalanceAlertMessage(
  params: { displayName: string; balance: bigint; threshold: bigint; recovered: boolean },
  baseUrl: string = baseUrlOrEmpty(),
): string {
  const balanceStr = formatRupiah(params.balance);
  if (params.recovered) {
    return `✅ Saldo ${params.displayName} pulih: ${balanceStr}\n${baseUrl}/admin/providers`;
  }
  return `⚠️ Saldo ${params.displayName} menipis: ${balanceStr} (ambang ${formatRupiah(params.threshold)})\n${baseUrl}/admin/providers`;
}

export interface OrderNotifyData {
  orderNumber: string;
  productName: string;
  itemName: string;
  total: bigint;
  target?: string | null;
  buyerLabel?: string | null;
  paymentMethod?: string | null;
}

function orderLines(order: OrderNotifyData): string[] {
  return [
    `${order.productName} · ${order.itemName}`,
    order.target ? `Tujuan: ${order.target}` : "",
    `Total: ${formatRupiah(order.total)}`,
    order.paymentMethod ? `Metode: ${order.paymentMethod}` : "",
    order.buyerLabel ? `Pembeli: ${order.buyerLabel}` : "",
  ].filter((l) => l !== "");
}

export function formatOrderCreatedMessage(order: OrderNotifyData, baseUrl: string = baseUrlOrEmpty()): string {
  return [
    `🧾 Order baru ${order.orderNumber} (menunggu pembayaran)`,
    ...orderLines(order),
    `${baseUrl}/admin/orders/${order.orderNumber}`,
  ].join("\n");
}

export function formatOrderPaidMessage(order: OrderNotifyData, baseUrl: string = baseUrlOrEmpty()): string {
  return [
    `💰 Pembayaran diterima - ${order.orderNumber}`,
    ...orderLines(order),
    `${baseUrl}/admin/orders/${order.orderNumber}`,
  ].join("\n");
}

export function formatOrderSuccessMessage(
  order: OrderNotifyData & { sn?: string | null },
  baseUrl: string = baseUrlOrEmpty(),
): string {
  return [
    `✅ Order ${order.orderNumber} berhasil`,
    ...orderLines(order),
    order.sn ? `SN: ${order.sn}` : "",
    `${baseUrl}/admin/orders/${order.orderNumber}`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

// Order produk manual (App Premium dsb): uangnya SUDAH masuk tapi tidak ada
// provider yang mengirimkannya - satu-satunya yang bisa menuntaskan adalah
// admin. Alert ini sengaja dibedakan dari order_paid biasa karena inilah yang
// benar-benar menuntut tindakan manusia, bukan sekadar kabar baik.
export function formatManualOrderMessage(order: OrderNotifyData, baseUrl: string = baseUrlOrEmpty()): string {
  return [
    `📦 Order manual ${order.orderNumber} - PERLU DIKIRIM ADMIN`,
    ...orderLines(order),
    ``,
    `Pembeli sudah membayar. Kirim produknya, lalu tandai selesai + isi data/SN di panel.`,
    `${baseUrl}/admin/orders/${order.orderNumber}`,
  ].join("\n");
}

export function formatDepositPaidMessage(
  params: { depositId: string; userLabel: string; amount: bigint; bonusAmount: bigint; balanceAfter: bigint },
  baseUrl: string = baseUrlOrEmpty(),
): string {
  return [
    `🏦 Deposit masuk ${formatRupiah(params.amount)}`,
    `Member: ${params.userLabel}`,
    params.bonusAmount > 0n ? `Bonus tier: ${formatRupiah(params.bonusAmount)}` : "",
    `Saldo sekarang: ${formatRupiah(params.balanceAfter)}`,
    `${baseUrl}/admin/wallet-ledger`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export function formatUserRegisteredMessage(
  params: { name: string; email: string },
  baseUrl: string = baseUrlOrEmpty(),
): string {
  return [`👤 User baru mendaftar`, `${params.name} <${params.email}>`, `${baseUrl}/admin/users`].join("\n");
}

// Tidak pernah throw - kegagalan kirim notifikasi tidak boleh mengganggu
// jalur uang di fulfillment.ts/runner.ts yang memanggil fungsi ini.
// Guard clause di dalam try untuk melindungi dari TypeError synchronous jika config malformed.
// Return boolean (bukan void) supaya caller yang butuh tahu status pengiriman
// benar-benar sukses (misal runner.ts check-provider-balance, untuk memutuskan
// apakah aman men-persist transisi status alert) bisa melakukannya - caller lain
// yang tidak peduli (escalateOrder di fulfillment.ts) bebas mengabaikan return value.
//
// `config` opsional: kalau tidak diberikan, dibaca dari SiteSetting terenkripsi
// (fallback ke env). Parameter ini dipertahankan supaya test & jalur "kirim tes
// dari panel admin" bisa memakai kredensial yang belum tersimpan.
export async function sendTelegramAlert(message: string, config?: TelegramCredentials): Promise<boolean> {
  try {
    const resolved = config ?? (await getTelegramNotifyConfig());
    if (!resolved?.botToken || !resolved?.chatId) {
      console.error("Telegram: bot token/chat ID belum dikonfigurasi (Admin → Pengaturan Situs), notifikasi dilewati");
      return false;
    }

    const res = await fetch(`https://api.telegram.org/bot${resolved.botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: resolved.chatId, text: message }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`Telegram: gagal kirim notifikasi (status ${res.status}): ${text.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("Telegram: gagal kirim notifikasi", { error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

/**
 * "disabled" sengaja DIBEDAKAN dari "failed" - keduanya sama-sama berarti "tidak
 * terkirim", tapi artinya berlawanan bagi pemanggil yang memakai hasil kirim
 * sebagai gerbang penulisan state (lihat check-provider-balance di jobs/runner.ts):
 * gagal kirim = coba lagi nanti, admin mematikan notifikasinya = jangan macetkan
 * state machine selamanya hanya karena admin tidak mau dinotifikasi.
 */
export type TelegramNotifyOutcome = "sent" | "disabled" | "failed";

// Pintu masuk yang dipakai SELURUH kode aplikasi. Membaca konfigurasi sekali,
// menghormati saklar induk + centang per event, baru mengirim.
//
// Sengaja satu fungsi (bukan cek toggle di tiap pemanggil): pemanggil tersebar
// di fulfillment/settlement/runner/actions, dan satu saja yang lupa mengecek
// berarti ada kategori notifikasi yang tidak bisa dimatikan admin.
export async function notifyTelegram(event: TelegramEvent, message: string): Promise<TelegramNotifyOutcome> {
  const config = await getTelegramNotifyConfig();
  if (!config) {
    console.error(`Telegram: notifikasi "${event}" dilewati - bot belum dikonfigurasi`);
    return "failed";
  }
  if (!config.enabled || !config.events[event]) return "disabled";
  return (await sendTelegramAlert(message, config)) ? "sent" : "failed";
}
