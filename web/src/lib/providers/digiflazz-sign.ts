import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Signature request Digiflazz: md5(username + apiKey + salt)
// salt = "pricelist" | "depo" | ref_id transaksi (spec §5.2)
export function digiflazzSign(username: string, apiKey: string, salt: string): string {
  return createHash("md5").update(`${username}${apiKey}${salt}`).digest("hex");
}

// Webhook Digiflazz: header X-Hub-Signature = "sha1=" + HMAC-SHA1(rawBody, secret)
export function verifyDigiflazzWebhookSignature(
  rawBody: string,
  secret: string,
  header: string | undefined,
): boolean {
  if (!header || !header.startsWith("sha1=")) return false;
  const expected = createHmac("sha1", secret).update(rawBody).digest("hex");
  const given = header.slice("sha1=".length);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given, "utf8"), Buffer.from(expected, "utf8"));
}
