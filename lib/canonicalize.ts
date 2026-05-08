export function canonicalizeBrand(brand: string | null | undefined): string | null {
  if (!brand || brand.trim() === "") return null;
  return (
    brand
      .toLowerCase()
      .replace(/[®™]/g, "")
      .replace(/['’]/g, "")
      .replace(/-/g, " ")
      .replace(/[.!?]+$/g, "")
      .replace(/\s+/g, " ")
      .trim() || null
  );
}
