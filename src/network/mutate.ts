import { isSeq, isScalar, YAMLMap, YAMLSeq, Document } from "yaml";
import { findBlocks, findCredsBlocks } from "../creds/locate";
import { loadDoc, render, splice, STALE, type MutateResult } from "../creds/yaml-doc";
import { parseNetworkBlock, type Scope } from "./parse";

export interface NewAddress {
  ip?: string;
  host?: string;
  scope?: Scope;
  label?: string;
  iface?: string;
  mac?: string;
  gateway?: string;
  vlan?: string;
  note?: string;
}

export interface NewPort {
  port: number;
  proto?: "tcp" | "udp";
  service?: string;
  note?: string;
}

/** Points at one entry; value is the ip, host or port number as shown, to catch a block that changed. */
export interface NetworkEntryRef {
  block: number;
  index: number;
  value: string;
}

const ADDRESS_ORDER = ["ip", "host", "scope", "label", "iface", "mac", "gateway", "vlan", "note"] as const;
const PORT_ORDER = ["port", "proto", "service", "note"] as const;

export function addNetworkEntry(note: string, entry: NewAddress | NewPort): MutateResult {
  const map = new YAMLMap();
  const order: readonly string[] = "port" in entry ? PORT_ORDER : ADDRESS_ORDER;
  for (const key of order) {
    const value = (entry as Record<string, unknown>)[key];
    if (value === undefined || value === "") continue;
    map.set(key, key === "vlan" && /^\d+$/.test(String(value)) ? Number(value) : value);
  }

  const block = findBlocks(note, "network")[0];
  if (!block) {
    const doc = new Document(new YAMLSeq());
    (doc.contents as YAMLSeq).items.push(map);
    const fenced = `\`\`\`network\n${render(doc)}\`\`\`\n`;
    const creds = findCredsBlocks(note)[0];
    if (creds) return { ok: true, note: `${note.slice(0, creds.start)}${fenced}\n${note.slice(creds.start)}` };
    const base = note.length === 0 || note.endsWith("\n") ? note : note + "\n";
    const gap = base.length === 0 || base.endsWith("\n\n") ? "" : "\n";
    return { ok: true, note: `${base}${gap}${fenced}` };
  }

  const doc = loadDoc(block.content);
  if (typeof doc === "string") return { ok: false, reason: doc };
  if (doc.contents === null || (isScalar(doc.contents) && doc.contents.value === null)) {
    doc.contents = new YAMLSeq() as never;
  }
  if (!isSeq(doc.contents)) return { ok: false, reason: STALE };
  doc.contents.items.push(map);
  return { ok: true, note: splice(note, block, render(doc)) };
}

/**
 * Rewrites the known fields of one entry from a form; fields left empty are removed. Unknown fields
 * stay. An address can't become a port or the other way round.
 */
export function updateNetworkEntry(note: string, ref: NetworkEntryRef, entry: NewAddress | NewPort): MutateResult {
  const block = findBlocks(note, "network")[ref.block];
  if (!block) return { ok: false, reason: STALE };
  const parsed = parseNetworkBlock(block.content);
  const current = parsed.entries.find((e) => e.index === ref.index);
  const shown = current?.type === "address" ? current.value : current?.type === "port" ? String(current.port) : null;
  if (!parsed.ok || !current || shown !== ref.value) return { ok: false, reason: STALE };
  const isPort = "port" in entry;
  if (isPort !== (current.type === "port")) return { ok: false, reason: STALE };

  const doc = loadDoc(block.content);
  if (typeof doc === "string" || !isSeq(doc.contents)) return { ok: false, reason: STALE };
  const item = doc.contents.items[ref.index];
  if (!(item instanceof YAMLMap)) return { ok: false, reason: STALE };
  for (const key of isPort ? PORT_ORDER : ADDRESS_ORDER) {
    const value = (entry as Record<string, unknown>)[key];
    if (value === undefined || value === "") item.delete(key);
    else item.set(key, key === "vlan" && /^\d+$/.test(String(value)) ? Number(value) : value);
  }
  return { ok: true, note: splice(note, block, render(doc)) };
}

export function deleteNetworkEntry(note: string, ref: NetworkEntryRef): MutateResult {
  const block = findBlocks(note, "network")[ref.block];
  if (!block) return { ok: false, reason: STALE };
  const parsed = parseNetworkBlock(block.content);
  const entry = parsed.entries.find((e) => e.index === ref.index);
  const shown = entry?.type === "address" ? entry.value : entry?.type === "port" ? String(entry.port) : null;
  if (!parsed.ok || shown !== ref.value) return { ok: false, reason: STALE };

  const doc = loadDoc(block.content);
  if (typeof doc === "string" || !isSeq(doc.contents)) return { ok: false, reason: STALE };
  doc.contents.items.splice(ref.index, 1);
  const content = doc.contents.items.length === 0 ? "" : render(doc);
  return { ok: true, note: splice(note, block, content) };
}
