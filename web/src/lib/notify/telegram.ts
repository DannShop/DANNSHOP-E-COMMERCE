export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

function configFromEnv(): TelegramConfig {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
    chatId: process.env.TELEGRAM_CHAT_ID ?? "",
  };
}

export function formatOrderAlertMessage(
  params: { orderNumber: string; status: string; reason: string },
  baseUrl: string = process.env.NEXT_PUBLIC_APP_URL ?? "",
): string {
  return `⚠️ Order ${params.orderNumber} → ${params.status}\n${params.reason}\n${baseUrl}/admin/orders/${params.orderNumber}`;
}

export function formatBalanceAlertMessage(
  params: { displayName: string; balance: bigint; threshold: bigint; recovered: boolean },
  baseUrl: string = process.env.NEXT_PUBLIC_APP_URL ?? "",
): string {
  const balanceStr = `Rp ${Number(params.balance).toLocaleString("id-ID")}`;
  if (params.recovered) {
    return `✅ Saldo ${params.displayName} pulih: ${balanceStr}\n${baseUrl}/admin/providers`;
  }
  const thresholdStr = `Rp ${Number(params.threshold).toLocaleString("id-ID")}`;
  return `⚠️ Saldo ${params.displayName} menipis: ${balanceStr} (ambang ${thresholdStr})\n${baseUrl}/admin/providers`;
}

// Tidak pernah throw - kegagalan kirim notifikasi tidak boleh mengganggu
// jalur uang di fulfillment.ts/runner.ts yang memanggil fungsi ini.
// Guard clause di dalam try untuk melindungi dari TypeError synchronous jika config malformed.
// Return boolean (bukan void) supaya caller yang butuh tahu status pengiriman
// benar-benar sukses (misal runner.ts check-provider-balance, untuk memutuskan
// apakah aman men-persist transisi status alert) bisa melakukannya - caller lain
// yang tidak peduli (escalateOrder di fulfillment.ts) bebas mengabaikan return value.
export async function sendTelegramAlert(message: string, config: TelegramConfig = configFromEnv()): Promise<boolean> {
  try {
    if (!config?.botToken || !config?.chatId) {
      console.error("Telegram: TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID belum di-set, notifikasi dilewati", { message });
      return false;
    }

    const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: config.chatId, text: message }),
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
