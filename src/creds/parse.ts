import { isMap, isScalar, isSeq, LineCounter, parseDocument, YAMLMap } from "yaml";
import { readRawString } from "./raw-scalar";
import { KINDS } from "../model";
import type { BlockIssue, Credential, Entry, HistoryEntry, Kind, ParseResult } from "../model";

const CORE_FIELDS = ["id", "label", "user", "secret", "kind", "note", "updated"] as const;
type CoreField = (typeof CORE_FIELDS)[number];

export function parseCredsBlock(text: string): ParseResult {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { version: "1.2", schema: "core", lineCounter, keepSourceTokens: false });
  const lineOf = (offset: number | undefined) =>
    offset === undefined ? undefined : lineCounter.linePos(offset).line;

  if (doc.errors.length > 0) {
    const err = doc.errors[0];
    return {
      entries: [],
      ok: false,
      issues: [{ level: "error", code: "yaml", message: err.message, line: err.linePos?.[0].line }],
    };
  }

  const root = doc.contents;
  if (root === null || (isScalar(root) && root.value === null)) {
    return { entries: [], issues: [], ok: true };
  }
  if (!isSeq(root)) {
    return {
      entries: [],
      ok: false,
      issues: [{ level: "error", code: "not-a-list", message: "A creds block must be a YAML list.", line: 1 }],
    };
  }

  const entries: Entry[] = [];
  const issues: BlockIssue[] = [];

  root.items.forEach((item, index) => {
    const line = lineOf((item as { range?: [number, number, number] }).range?.[0]);
    const warn = (code: BlockIssue["code"], message: string) =>
      issues.push({ level: "warning", code, message, line, index });

    if (!isMap(item)) {
      warn("invalid-entry", "Each entry must be a map with id and label, or a ref.");
      return;
    }

    if (item.has("ref")) {
      const ref = readRawString(item.get("ref", true), text);
      if (ref === null) {
        warn("invalid-ref", "ref needs a credential id.");
        return;
      }
      if (item.items.length > 1) warn("invalid-ref", `ref "${ref}" has extra fields. A ref entry holds only ref.`);
      entries.push({ type: "ref", ref, index });
      return;
    }

    const fields = readCoreFields(item, text, (field) =>
      warn("invalid-field", `${field} must be a single value, not a list or map.`),
    );
    if (!fields.id) {
      warn("missing-id", "Entry has no id.");
      return;
    }
    if (!fields.label) {
      warn("missing-label", `Entry "${fields.id}" has no label.`);
      return;
    }

    const cred: Credential = {
      type: "credential",
      id: fields.id,
      label: fields.label,
      kind: toKind(fields.kind),
      history: readHistory(item, text),
      index,
    };
    if (fields.user !== undefined) cred.user = fields.user;
    if (fields.secret !== undefined) cred.secret = fields.secret;
    if (fields.note !== undefined) cred.note = fields.note;
    if (fields.updated !== undefined) cred.updated = fields.updated;
    entries.push(cred);
  });

  return { entries, issues, ok: true };
}

function readCoreFields(
  map: YAMLMap,
  text: string,
  onInvalid: (field: CoreField) => void,
): Partial<Record<CoreField, string>> {
  const out: Partial<Record<CoreField, string>> = {};
  for (const field of CORE_FIELDS) {
    if (!map.has(field)) continue;
    const node = map.get(field, true);
    if (isMap(node) || isSeq(node)) {
      onInvalid(field);
      continue;
    }
    const value = readRawString(node, text);
    if (value !== null) out[field] = value;
  }
  return out;
}

function readHistory(map: YAMLMap, text: string): HistoryEntry[] {
  const node = map.get("history", true);
  if (!isSeq(node)) return [];
  const history: HistoryEntry[] = [];
  for (const item of node.items) {
    if (!isMap(item)) continue;
    const secret = readRawString(item.get("secret", true), text);
    if (secret === null) continue;
    const entry: HistoryEntry = { secret, until: readRawString(item.get("until", true), text) ?? "" };
    const reason = readRawString(item.get("reason", true), text);
    if (reason !== null) entry.reason = reason;
    history.push(entry);
  }
  return history;
}

function toKind(value: string | undefined): Kind {
  return (KINDS as readonly string[]).includes(value ?? "") ? (value as Kind) : "other";
}
