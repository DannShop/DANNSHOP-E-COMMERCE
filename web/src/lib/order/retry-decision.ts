export interface FulfillmentAttempt {
  id: string;
  attemptNo: number;
  status: "SENT" | "PROCESSING" | "SUCCESS" | "FAILED";
}

export type RetryDecision =
  | { action: "recheck_status"; fulfillmentId: string }
  | { action: "send_fresh"; nextAttemptNo: number }
  | { action: "not_eligible"; reason: string };

export function decideFulfillmentRetry(fulfillments: FulfillmentAttempt[]): RetryDecision {
  if (fulfillments.length === 0) return { action: "send_fresh", nextAttemptNo: 1 };

  const latest = fulfillments.reduce((a, b) => (a.attemptNo > b.attemptNo ? a : b));

  if (latest.status === "SUCCESS") {
    return { action: "not_eligible", reason: "Order sudah selesai (SN sudah terbit)." };
  }
  if (latest.status === "SENT" || latest.status === "PROCESSING") {
    return { action: "recheck_status", fulfillmentId: latest.id };
  }
  return { action: "send_fresh", nextAttemptNo: latest.attemptNo + 1 };
}
