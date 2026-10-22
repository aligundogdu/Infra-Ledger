const FOLD: Record<string, string> = { ı: "i", İ: "i", ş: "s", Ş: "s", ğ: "g", Ğ: "g", ç: "c", Ç: "c", ö: "o", Ö: "o", ü: "u", Ü: "u" };

export function slugify(text: string): string {
  return text
    .replace(/[ıİşŞğĞçÇöÖüÜ]/g, (c) => FOLD[c])
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function suggestId(resourceName: string, label: string, taken: Set<string>): string {
  const base = [slugify(resourceName), slugify(label) || "credential"].filter(Boolean).join("-");
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
