import { isMap, isScalar, isSeq, type YAMLMap } from "yaml";
import { findCredsBlocks } from "../creds/locate";
import { parseCredsBlock } from "../creds/parse";
import { loadDoc, quoted, render, STALE } from "../creds/yaml-doc";

/** Every secret and history secret in the note's creds blocks, as written. */
export function collectSecrets(note: string): string[] {
  const out: string[] = [];
  for (const block of findCredsBlocks(note)) {
    for (const e of parseCredsBlock(block.content).entries) {
      if (e.type !== "credential") continue;
      if (e.secret !== undefined) out.push(e.secret);
      for (const h of e.history) out.push(h.secret);
    }
  }
  return out;
}

export type MapResult = { ok: true; note: string; changed: number } | { ok: false; reason: string };

/**
 * Replaces secret and history secret values for which `map` returns a new value. Only creds blocks
 * with a change are rewritten; every other byte of the note stays the same.
 */
export function mapSecrets(note: string, map: (value: string) => string | undefined): MapResult {
  let out = "";
  let pos = 0;
  let changed = 0;
  for (const block of findCredsBlocks(note)) {
    const doc = loadDoc(block.content);
    if (typeof doc === "string") {
      if (/\bsecret\s*:/.test(block.content)) return { ok: false, reason: STALE };
      continue;
    }
    if (!isSeq(doc.contents)) continue;
    let blockChanged = 0;
    for (const item of doc.contents.items) {
      if (!isMap(item) || item.has("ref")) continue;
      blockChanged += replaceIn(item, map);
      const history: unknown = item.get("history", true);
      if (isSeq(history)) for (const h of history.items) if (isMap(h)) blockChanged += replaceIn(h, map);
    }
    if (blockChanged === 0) continue;
    changed += blockChanged;
    out += note.slice(pos, block.contentStart) + render(doc);
    pos = block.contentEnd;
  }
  if (changed === 0) return { ok: true, note, changed: 0 };
  return { ok: true, note: out + note.slice(pos), changed };
}

function replaceIn(map: YAMLMap, fn: (value: string) => string | undefined): number {
  const node: unknown = map.get("secret", true);
  if (!isScalar(node) || node.value === null || node.value === undefined) return 0;
  const current = String(node.value);
  const next = fn(current);
  if (next === undefined || next === current) return 0;
  const scalar = quoted(next);
  scalar.comment = node.comment;
  scalar.commentBefore = node.commentBefore;
  map.set("secret", scalar);
  return 1;
}
