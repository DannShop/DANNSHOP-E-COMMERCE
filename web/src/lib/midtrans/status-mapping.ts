export function mapMidtransStatus(
  transactionStatus: string,
  fraudStatus?: string | null,
): "paid" | "pending" | "failed" | "expired" {
  if (transactionStatus === "settlement") return "paid";
  if (transactionStatus === "capture") return fraudStatus === "accept" ? "paid" : "failed";
  if (transactionStatus === "pending") return "pending";
  if (transactionStatus === "expire") return "expired";
  return "failed"; // cancel, deny, dan status lain yang tidak dikenal
}
