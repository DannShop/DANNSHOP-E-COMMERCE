export function generateOrderNumber(now: Date, random: () => number = Math.random): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const suffix = Math.floor(random() * 10000)
    .toString()
    .padStart(4, "0");
  return `INV-${y}${m}${d}-${suffix}`;
}

export function generateRefId(prefix: string, now: Date, random: () => number = Math.random): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(random() * chars.length) % chars.length];
  }
  return `${prefix}-${y}${m}${d}${hh}${mm}${ss}-${suffix}`;
}
