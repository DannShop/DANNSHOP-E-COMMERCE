export function buildCustomerNo(inputFields: { name: string }[], target: Record<string, string>): string {
  return inputFields.map((f) => target[f.name] ?? "").join("");
}
