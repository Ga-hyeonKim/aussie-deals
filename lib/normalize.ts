function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeName(
  name: string,
  brand?: string | null
): string {
  let result = name;

  if (brand) {
    const pattern = new RegExp(`^${escapeRegex(brand)}\\s+`, "i");
    result = result.replace(pattern, "");
  }

  return result
    .toLowerCase()
    .replace(/[®™©]/g, "")
    .replace(/(\d+)\s+(g|kg|ml|l|pk|pack)\b/gi, (_, n, u) => `${n}${u.toLowerCase()}`)
    .replace(/\s+/g, " ")
    .trim();
}
