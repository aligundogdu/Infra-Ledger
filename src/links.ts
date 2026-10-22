export interface LinkValue {
  /** Text to show: the alias, else the link target, else the plain text. */
  display: string;
  /** Link target when the value is a [[wiki link]]. */
  link?: string;
}

/** Reads a property that holds plain text or a "[[wiki link]]". A list uses its first item. */
export function parseLinkValue(value: unknown): LinkValue | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null) return null;
  const text = String(raw).trim();
  if (text === "") return null;
  const m = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/.exec(text);
  if (!m) return { display: text };
  const link = m[1].trim();
  return { display: (m[2] ?? link).trim(), link };
}
