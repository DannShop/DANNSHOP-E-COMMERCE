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

// Tidak pernah throw - kegagalan kirim notifikasi tidak boleh mengganggu
// jalur uang di fulfillment.ts/runner.ts yang memanggil fungsi ini.
export async function sendTelegramAlert(message: string, config: TelegramConfig = configFromEnv()): Promise<void> {
  if (!config.botToken || !config.chatId) {
    console.error("Telegram: TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID belum di-set, notifikasi dilewati", { message });
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: config.chatId, text: message }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`Telegram: gagal kirim notifikasi (status ${res.status}): ${text.slice(0, 200)}`);
    }
  } catch (e) {
    console.error("Telegram: gagal kirim notifikasi", { error: e instanceof Error ? e.message : String(e) });
  }
}
