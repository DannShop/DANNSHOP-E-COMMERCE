import { z } from "zod";

export const checkoutSchema = z.object({
  productItemId: z.string().min(1, "Item wajib dipilih"),
  buyerEmail: z.string().email("Email tidak valid"),
  target: z.record(z.string(), z.string().min(1, "Wajib diisi")),
});

export function extractTargetFromFormData(formData: FormData): Record<string, string> {
  const target: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("target.") && typeof value === "string") {
      target[key.slice("target.".length)] = value;
    }
  }
  return target;
}
