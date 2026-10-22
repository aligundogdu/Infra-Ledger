import { isScalar, isSeq, parse, Document, YAMLMap, YAMLSeq } from "yaml";
import { findBlocks } from "../creds/locate";
import { loadDoc, render, splice, STALE, type MutateResult } from "../creds/yaml-doc";
import { parseLinkValue } from "../links";
import type { EventKind } from "./parse";

export interface NewEvent {
  date: string;
  event: EventKind;
  to?: string;
  from?: string;
  note?: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;

export function readFrontmatterField(note: string, key: string): string | null {
  const m = FRONTMATTER.exec(note);
  if (!m) return null;
  try {
    const data = parse(m[1], { version: "1.2", schema: "core" }) as Record<string, unknown> | null;
    const value = data?.[key];
    if (value === undefined || value === null) return null;
    const text = String(Array.isArray(value) ? value[0] : value).trim();
    return text === "" ? null : text;
  } catch {
    return null;
  }
}

/**
 * Sets one frontmatter key by rewriting only its line (and the indented lines of a multi-line
 * value). null leaves the key with an empty value. Every other byte of the note is kept.
 */
export function setFrontmatterField(note: string, key: string, value: string | null): string {
  const line = value === null ? `${key}:` : `${key}: ${JSON.stringify(value)}`;
  const m = FRONTMATTER.exec(note);
  if (!m) return `---\n${line}\n---\n${note}`;

  const bodyStart = note.indexOf("\n") + 1;
  const body = m[1];
  const rows = body.split("\n");
  const at = rows.findIndex((r) => new RegExp(`^${escape(key)}\\s*:`).test(r));
  if (at === -1) {
    rows.push(line);
  } else {
    let end = at + 1;
    // Continuation lines: indented, or "- item" list rows that YAML allows without indent.
    while (end < rows.length && /^(\s+\S|-(\s|$))/.test(rows[end])) end++;
    rows.splice(at, end - at, line);
  }
  return note.slice(0, bodyStart) + rows.join("\n") + note.slice(bodyStart + body.length);
}

export function addEvent(note: string, event: NewEvent): MutateResult {
  return prependEvents(note, [event]);
}

export function assignTo(note: string, person: string, today: string, comment?: string): MutateResult {
  const current = readFrontmatterField(note, "assigned_to");
  if (current && sameHolder(current, person)) {
    return { ok: false, reason: `Already assigned to ${parseLinkValue(person)?.display ?? person}.` };
  }
  const events: NewEvent[] = [{ date: today, event: "assigned", to: person, ...(comment && { note: comment }) }];
  if (current) events.push({ date: today, event: "returned", from: current });
  const logged = prependEvents(note, events);
  if (!logged.ok) return logged;
  return { ok: true, note: setFrontmatterField(logged.note, "assigned_to", person) };
}

export function returnDevice(note: string, today: string, comment?: string): MutateResult {
  const current = readFrontmatterField(note, "assigned_to");
  if (!current) return { ok: false, reason: "This device isn't assigned to anyone." };
  const logged = prependEvents(note, [{ date: today, event: "returned", from: current, ...(comment && { note: comment }) }]);
  if (!logged.ok) return logged;
  return { ok: true, note: setFrontmatterField(logged.note, "assigned_to", null) };
}

/** Adds events at the top of the first ledger block, creating one at the end of the note if needed. */
function prependEvents(note: string, events: NewEvent[]): MutateResult {
  const maps = events.map(toMap);
  const block = findBlocks(note, "ledger")[0];
  if (!block) {
    const doc = new Document(new YAMLSeq());
    (doc.contents as YAMLSeq).items.push(...maps);
    const base = note.length === 0 || note.endsWith("\n") ? note : note + "\n";
    const gap = base.length === 0 || base.endsWith("\n\n") ? "" : "\n";
    return { ok: true, note: `${base}${gap}\`\`\`ledger\n${render(doc)}\`\`\`\n` };
  }
  const doc = loadDoc(block.content);
  if (typeof doc === "string") return { ok: false, reason: doc };
  if (doc.contents === null || (isScalar(doc.contents) && doc.contents.value === null)) {
    doc.contents = new YAMLSeq() as never;
  }
  if (!isSeq(doc.contents)) return { ok: false, reason: STALE };
  const seq = doc.contents;
  // A comment above the first entry belongs to the block, not to that entry: keep it on top.
  const first = seq.items[0] as { commentBefore?: string | null } | undefined;
  const lead = first?.commentBefore;
  if (first && lead) first.commentBefore = null;
  seq.items.unshift(...maps);
  if (lead) (seq.items[0] as YAMLMap).commentBefore = lead;
  return { ok: true, note: splice(note, block, render(doc)) };
}

function toMap(e: NewEvent): YAMLMap {
  const map = new YAMLMap();
  map.set("date", e.date);
  map.set("event", e.event);
  if (e.to) map.set("to", e.to);
  if (e.from) map.set("from", e.from);
  if (e.note) map.set("note", e.note);
  return map;
}

function sameHolder(a: string, b: string): boolean {
  return parseLinkValue(a)?.display.toLowerCase() === parseLinkValue(b)?.display.toLowerCase();
}

function escape(t: string): string {
  return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
