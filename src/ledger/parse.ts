import { isMap, isScalar, isSeq, type YAMLMap } from "yaml";
import { parseListBlock } from "../creds/list-block";
import { readRawString } from "../creds/raw-scalar";
import { parseLinkValue, type LinkValue } from "../links";
import type { BlockIssue } from "../model";

export const EVENTS = ["assigned", "returned", "service", "repair", "upgrade", "moved", "lost", "retired", "note"] as const;
export type EventKind = (typeof EVENTS)[number];

export interface LedgerEvent {
  date: string;
  event: EventKind;
  to?: LinkValue;
  from?: LinkValue;
  note?: string;
  /** Unknown fields, and the written name of an unknown event. */
  extra: Record<string, string>;
  index: number;
}

export interface LedgerParseResult {
  events: LedgerEvent[];
  issues: BlockIssue[];
  ok: boolean;
}

export type LedgerStatus =
  | { kind: "assigned"; who: LinkValue; since?: string }
  | { kind: "retired"; since: string }
  | { kind: "unassigned" };

const KNOWN = ["date", "event", "to", "from", "note"];

export function parseLedgerBlock(text: string): LedgerParseResult {
  const block = parseListBlock(text, "ledger");
  if (block.kind === "empty") return { events: [], issues: [], ok: true };
  if (block.kind === "error") return { events: [], issues: [block.issue], ok: false };

  const events: LedgerEvent[] = [];
  const issues: BlockIssue[] = [];
  block.seq.items.forEach((item, index) => {
    const line = block.lineOf((item as { range?: [number, number, number] }).range?.[0]);
    const map = isMap(item) ? item : null;
    const date = map ? readRawString(map.get("date", true), text) : null;
    const written = map ? readRawString(map.get("event", true), text) : null;
    if (!map || !date || !written) {
      issues.push({ level: "warning", code: "invalid-ledger-entry", message: "Each entry needs a date and an event.", line, index });
      return;
    }
    const known = (EVENTS as readonly string[]).includes(written.toLowerCase());
    const event: LedgerEvent = {
      date,
      event: known ? (written.toLowerCase() as EventKind) : "note",
      extra: extraFields(map, text),
      index,
    };
    if (!known) event.extra = { event: written, ...event.extra };
    const to = parseLinkValue(readRawString(map.get("to", true), text));
    const from = parseLinkValue(readRawString(map.get("from", true), text));
    const note = readRawString(map.get("note", true), text);
    if (to) event.to = to;
    if (from) event.from = from;
    if (note !== null) event.note = note;
    events.push(event);
  });
  return { events, issues, ok: true };
}

/**
 * Current state of a device. The property `assigned_to` is the source of truth for who has it;
 * the log supplies the date. A newer "retired" event wins.
 */
export function ledgerStatus(events: LedgerEvent[], assignedTo: unknown): LedgerStatus {
  const latest = events.find((e) => e.event === "assigned" || e.event === "returned" || e.event === "retired");
  if (latest?.event === "retired") return { kind: "retired", since: latest.date };
  const who = parseLinkValue(assignedTo);
  if (!who) return { kind: "unassigned" };
  const since = events.find((e) => e.event === "assigned" && e.to?.display === who.display)?.date;
  return since ? { kind: "assigned", who, since } : { kind: "assigned", who };
}

function extraFields(map: YAMLMap, text: string): Record<string, string> {
  const extra: Record<string, string> = {};
  for (const pair of map.items) {
    const key = isScalar(pair.key) ? String(pair.key.value) : null;
    if (key === null || KNOWN.includes(key) || isMap(pair.value) || isSeq(pair.value)) continue;
    const value = readRawString(pair.value, text);
    if (value !== null) extra[key] = value;
  }
  return extra;
}
