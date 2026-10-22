import { Document, isMap, isScalar, isSeq, YAMLMap, YAMLSeq } from "yaml";
import { loadDoc, quoted, render, splice, STALE, type MutateResult } from "./yaml-doc";
import { findCredsBlocks, type BlockLocation } from "./locate";
import { parseCredsBlock } from "./parse";
import type { Kind } from "../model";

export type { MutateResult } from "./yaml-doc";

export interface NewCredential {
  id: string;
  label: string;
  user?: string;
  secret?: string;
  kind?: Kind;
  note?: string;
  auth?: "password" | "key";
  keyPath?: string;
}


export function changeSecret(note: string, id: string, newSecret: string, today: string, reason?: string): MutateResult {
  return editCredential(note, id, (item) => {
    const oldRaw = rawOf(item, "secret");
    if (oldRaw !== null) {
      const existing: unknown = item.get("history", true);
      const history = isSeq(existing) ? existing : new YAMLSeq();
      if (history !== existing) item.set("history", history);
      const row = new YAMLMap();
      row.set("secret", quoted(oldRaw));
      row.set("until", today);
      if (reason) row.set("reason", reason);
      history.items.unshift(row);
    }
    const previous: unknown = item.get("secret", true);
    const next = quoted(newSecret);
    if (isScalar(previous)) {
      next.comment = previous.comment;
      next.commentBefore = previous.commentBefore;
    }
    item.set("secret", next);
    item.set("updated", today);
    return null;
  });
}

/** Fields the edit form can change. The secret is left out on purpose: changeSecret keeps its history. */
export interface CredentialPatch {
  label?: string;
  user?: string;
  kind?: Kind;
  note?: string;
  auth?: "password" | "key";
  keyPath?: string;
}

/** Applies a patch; an empty string removes the field. Unknown fields and the secret stay as they are. */
export function updateCredential(note: string, id: string, patch: CredentialPatch): MutateResult {
  if (patch.label !== undefined && patch.label.trim() === "") return { ok: false, reason: "A label is required." };
  return editCredential(note, id, (item) => {
    for (const key of ["label", "user", "kind", "note"] as const) {
      const value = patch[key];
      if (value === undefined) continue;
      if (value === "") item.delete(key);
      else item.set(key, value);
    }
    if (patch.auth === "password") {
      item.delete("auth");
      item.delete("key_path");
    } else if (patch.auth === "key") {
      item.set("auth", "key");
    }
    if (patch.keyPath !== undefined && patch.auth !== "password") {
      if (patch.keyPath === "") item.delete("key_path");
      else item.set("key_path", patch.keyPath);
    }
    return null;
  });
}

export function deleteHistoryEntry(note: string, id: string, historyIndex: number): MutateResult {
  return editCredential(note, id, (item) => {
    const history: unknown = item.get("history", true);
    if (!isSeq(history) || historyIndex < 0 || historyIndex >= history.items.length) return STALE;
    history.items.splice(historyIndex, 1);
    if (history.items.length === 0) item.delete("history");
    return null;
  });
}

export function deleteCredential(note: string, id: string): MutateResult {
  const target = locateUnique(note, id);
  if (typeof target === "string") return { ok: false, reason: target };
  const { block, doc, seq, itemIndex } = target;
  seq.items.splice(itemIndex, 1);
  const content = seq.items.length === 0 ? "" : render(doc);
  return { ok: true, note: splice(note, block, content) };
}

export function addCredential(note: string, cred: NewCredential): MutateResult {
  const blocks = findCredsBlocks(note);
  for (const b of blocks) {
    const { entries } = parseCredsBlock(b.content);
    if (entries.some((e) => e.type === "credential" && e.id === cred.id)) {
      return { ok: false, reason: `Id "${cred.id}" is already used in this note. Pick another id.` };
    }
  }

  const map = new YAMLMap();
  map.set("id", cred.id);
  map.set("label", cred.label);
  if (cred.user) map.set("user", cred.user);
  if (cred.auth === "key") {
    map.set("auth", "key");
    if (cred.keyPath) map.set("key_path", cred.keyPath);
  }
  if (cred.secret) map.set("secret", quoted(cred.secret));
  if (cred.kind) map.set("kind", cred.kind);
  if (cred.note) map.set("note", cred.note);

  if (blocks.length === 0) {
    const doc = new Document(new YAMLSeq());
    (doc.contents as YAMLSeq).items.push(map);
    const base = note.length === 0 || note.endsWith("\n") ? note : note + "\n";
    const gap = base.length === 0 || base.endsWith("\n\n") ? "" : "\n";
    return { ok: true, note: `${base}${gap}\`\`\`creds\n${render(doc)}\`\`\`\n` };
  }

  const block = blocks[0];
  const doc = loadDoc(block.content);
  if (typeof doc === "string") return { ok: false, reason: doc };
  if (doc.contents === null || (isScalar(doc.contents) && doc.contents.value === null)) {
    doc.contents = new YAMLSeq() as never;
  }
  if (!isSeq(doc.contents)) return { ok: false, reason: STALE };
  doc.contents.items.push(map);
  return { ok: true, note: splice(note, block, render(doc)) };
}

function editCredential(note: string, id: string, edit: (item: YAMLMap) => string | null): MutateResult {
  const target = locateUnique(note, id);
  if (typeof target === "string") return { ok: false, reason: target };
  const err = edit(target.item);
  if (err) return { ok: false, reason: err };
  return { ok: true, note: splice(note, target.block, render(target.doc)) };
}

interface Target {
  block: BlockLocation;
  doc: Document;
  seq: YAMLSeq;
  item: YAMLMap;
  itemIndex: number;
}

/** Finds the single entry with this id across the note's creds blocks. */
function locateUnique(note: string, id: string): Target | string {
  const hits: Target[] = [];
  for (const block of findCredsBlocks(note)) {
    const parsed = parseCredsBlock(block.content);
    const matches = parsed.entries.filter((e) => e.type === "credential" && e.id === id);
    if (matches.length === 0) continue;
    if (!parsed.ok) return STALE;
    const doc = loadDoc(block.content);
    if (typeof doc === "string") return doc;
    const seq = doc.contents as YAMLSeq;
    for (const m of matches) {
      const item = seq.items[m.index];
      if (isMap(item)) hits.push({ block, doc, seq, item, itemIndex: m.index });
    }
  }
  if (hits.length === 0) return STALE;
  if (hits.length > 1) return `Duplicate id "${id}" in this note. Rename one before editing.`;
  return hits[0];
}

function rawOf(item: YAMLMap, key: string): string | null {
  const node = item.get(key, true);
  if (!isScalar(node) || node.value === null || node.value === undefined) return null;
  return String(node.value);
}
