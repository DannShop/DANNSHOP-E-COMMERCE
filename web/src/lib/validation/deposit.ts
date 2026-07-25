import { z } from "zod";

export const MIN_DEPOSIT = 10_000n;
export const MAX_DEPOSIT = 5_000_000n;

export const depositSchema = z.object({
  amount: z.coerce
    .bigint()
    .min(MIN_DEPOSIT, `Nominal minimal Rp${MIN_DEPOSIT.toLocaleString("id-ID")}`)
    .max(MAX_DEPOSIT, `Nominal maksimal Rp${MAX_DEPOSIT.toLocaleString("id-ID")}`),
});
