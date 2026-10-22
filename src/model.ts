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
  /** For auth "key", the passphrase of the key, if any. */
  secret?: string;
  kind: Kind;
  auth: "password" | "key";
  /** Where the private key lives on this computer, for auth "key". */
  keyPath?: string;
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
  | "invalid-ref"
  | "invalid-network-entry"
  | "invalid-port"
  | "invalid-ledger-entry";

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
