export type BalanceAlertStatus = "OK" | "LOW";

export interface BalanceAlertTransition {
  newStatus: BalanceAlertStatus;
  alert: "none" | "low" | "recovered";
}

// Edge-triggered: alert cuma dikirim saat status BERUBAH, bukan tiap kali saldo
// masih di bawah ambang (supaya tidak spam Telegram selama admin belum top-up).
export function decideBalanceAlertTransition(
  balance: bigint,
  threshold: bigint,
  currentStatus: BalanceAlertStatus,
): BalanceAlertTransition {
  const isLow = balance < threshold;

  if (isLow && currentStatus === "OK") {
    return { newStatus: "LOW", alert: "low" };
  }
  if (!isLow && currentStatus === "LOW") {
    return { newStatus: "OK", alert: "recovered" };
  }
  return { newStatus: currentStatus, alert: "none" };
}
