import { Document, parseDocument, Scalar, visit } from "yaml";
import type { BlockLocation } from "./locate";

export type MutateResult = { ok: true; note: string } | { ok: false; reason: string };

export const STALE = "Can't save: the block changed since you opened this. Reopen and try again.";

/**
 * Parses block content and pins every plain scalar to its source text, so that
 * re-serialising never turns `0123` into `123` or `0xff` into `255`.
 */
export function loadDoc(content: string): Document | string {
  const doc = parseDocument(content, { version: "1.2", schema: "core" });
  if (doc.errors.length > 0) return STALE;
  visit(doc, {
    Scalar(_key, node) {
      if (node.type !== Scalar.PLAIN || typeof node.value === "string" || !node.range) return;
      const raw = content.slice(node.range[0], node.range[1]).trim();
      if (raw !== "") node.value = raw;
    },
  });
  return doc;
}

export function quoted(value: string): Scalar {
  const s = new Scalar(value);
  s.type = Scalar.QUOTE_DOUBLE;
  return s;
}

export function render(doc: Document): string {
  return doc.toString({ lineWidth: 0, indentSeq: true });
}

export function splice(note: string, block: BlockLocation, content: string): string {
  return note.slice(0, block.contentStart) + content + note.slice(block.contentEnd);
}
