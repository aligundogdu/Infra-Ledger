import { isScalar, isSeq, LineCounter, parseDocument, type YAMLSeq } from "yaml";
import type { BlockIssue } from "../model";

export type ListBlock =
  | { kind: "empty" }
  | { kind: "list"; seq: YAMLSeq; lineOf: (offset: number | undefined) => number | undefined }
  | { kind: "error"; issue: BlockIssue };

/** Parses a fenced block body that must be a YAML list (YAML 1.2 core schema). */
export function parseListBlock(text: string, what: string): ListBlock {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { version: "1.2", schema: "core", lineCounter });
  if (doc.errors.length > 0) {
    const err = doc.errors[0];
    return { kind: "error", issue: { level: "error", code: "yaml", message: err.message, line: err.linePos?.[0].line } };
  }
  const root = doc.contents;
  if (root === null || (isScalar(root) && root.value === null)) return { kind: "empty" };
  if (!isSeq(root)) {
    return {
      kind: "error",
      issue: { level: "error", code: "not-a-list", message: `A ${what} block must be a YAML list.`, line: 1 },
    };
  }
  return {
    kind: "list",
    seq: root,
    lineOf: (offset) => (offset === undefined ? undefined : lineCounter.linePos(offset).line),
  };
}
