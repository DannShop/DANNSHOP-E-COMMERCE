export function hasSufficientBalance(balance: bigint, total: bigint): boolean {
  return balance >= total;
}

export function decideRefundDestination(userId: string | null): "wallet" | "queue" {
  return userId ? "wallet" : "queue";
}
