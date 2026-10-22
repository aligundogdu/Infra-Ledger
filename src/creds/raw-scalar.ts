import { isScalar, Scalar } from "yaml";

/**
 * Returns a scalar's value as the user wrote it. Plain scalars are sliced from
 * the source, so `0123`, `0xff`, `null` or `true` are never coerced; quoted and
 * block scalars use the parsed string, which already has escapes applied.
 * Returns null for non-scalars and for empty values.
 */
export function readRawString(node: unknown, source: string): string | null {
  if (!isScalar(node)) return null;
  const scalar = node as Scalar;
  if (scalar.type === Scalar.PLAIN || scalar.type === undefined) {
    if (!scalar.range) return scalar.value == null ? null : String(scalar.value);
    const raw = source.slice(scalar.range[0], scalar.range[1]).trim();
    return raw === "" ? null : raw;
  }
  return scalar.value == null ? null : String(scalar.value);
}
