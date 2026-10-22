export const KINDS = ["ssh", "db", "panel", "api-key", "other"] as const;
export type Kind = (typeof KINDS)[number];

export interface HistoryEntry {
  secret: string;
  until: string;
  reason?: string;
}

export interface Credential {
  type: "credential";
  id: string;
  label: string;
  user?: string;
  secret?: string;
  kind: Kind;
  note?: string;
  updated?: string;
  history: HistoryEntry[];
  /** Position of the entry in its block. */
  index: number;
}

export interface CredRef {
  type: "ref";
  ref: string;
  index: number;
}

export type Entry = Credential | CredRef;

export type IssueCode =
  | "yaml"
  | "not-a-list"
  | "invalid-entry"
  | "missing-id"
  | "missing-label"
  | "invalid-field"
  | "invalid-ref";

export interface BlockIssue {
  level: "error" | "warning";
  code: IssueCode;
  message: string;
  /** 1-based line inside the block. */
  line?: number;
  index?: number;
}

export interface ParseResult {
  entries: Entry[];
  issues: BlockIssue[];
  /** False only when the block has an error; warnings keep it usable. */
  ok: boolean;
}
