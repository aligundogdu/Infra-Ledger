import { findAllBlocks } from "../creds/locate";

export type FindingKind = "token" | "dsn" | "sql" | "labeled" | "env" | "unlabeled";
export type Confidence = "high" | "medium" | "low";

export interface Finding {
  kind: FindingKind;
  confidence: Confidence;
  /** What the value is, e.g. "password", "MAILER_DSN", "AWS access key". */
  label: string;
  value: string;
  /** Offsets of the value in the note; note.slice(start, end) === value. */
  start: number;
  end: number;
  /** 0-based line where the value starts. */
  line: number;
  user?: string;
  host?: string;
}

export interface DetectOptions {
  /** Also report lone random-looking lines inside code blocks. */
  unlabeled: boolean;
}

/** Blocks Infra Ledger manages; their content is already in order. */
const MANAGED = new Set(["creds", "network", "ledger", "related"]);

const LABEL = String.raw`(?<![\p{L}\p{N}])(?:pass(?:word|wd)?|pwd|[sş]ifre(?:si)?|parola(?:sı)?|secret|token|api[ _-]?key|access[ _-]?key|secret[ _-]?key)(?![\p{L}])`;
const SAME_LINE = new RegExp(String.raw`^\s*(?:[-*+]\s+)?(?:\*\*)?(?<label>[^:=\n]{0,40}?${LABEL}[^:=\n]{0,20}?)(?:\*\*)?\s*[:=]\s*(?<value>.*?)\s*$`, "iu");
// A line that is only a label, e.g. "Administrator Password". No digits after the label word.
const BARE_LABEL = new RegExp(String.raw`^\s*(?:[-*+]\s+)?(?:\*\*)?(?<label>[\p{L}\p{N} _.-]{0,40}?${LABEL}[\p{L} _.]{0,20}?)(?:\*\*)?\s*:?\s*$`, "iu");
const SPACED = new RegExp(String.raw`^\s*(?:[-*+]\s+)?(?<label>[\p{L}\p{N} _.-]{0,30}?${LABEL})\s+(?<value>\S+)\s*$`, "iu");
const ENV = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/;
const ENV_SECRET = /PASS|SECRET|TOKEN|KEY/;
const DSN = /\b([a-z][a-z0-9+.-]*):\/\/([^:/\s@]*):([^@\s/]+)@([^\s/:?#"'`]+)/gi;
const SQL_PASSWORD = [
  /ENCRYPTED\s+PASSWORD\s+'([^']+)'/i,
  /IDENTIFIED\s+(?:WITH\s+\S+\s+)?BY\s+'([^']+)'/i,
  /PASSWORD\s*=\s*'([^']+)'/i,
  /WITH\s+PASSWORD\s+'([^']+)'/i,
];
const SQL_USER = /(?:CREATE|ALTER)\s+(?:USER|LOGIN|ROLE)\s+(?:IF\s+NOT\s+EXISTS\s+)?[`'"]?([\w.$-]+)/i;
const TOKENS: { re: RegExp; label: string }[] = [
  { re: /\bAKIA[0-9A-Z]{16}\b/g, label: "AWS access key" },
  { re: /\bghp_[A-Za-z0-9]{36}\b/g, label: "GitHub token" },
  { re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g, label: "GitHub token" },
  { re: /\bsk_live_[0-9a-zA-Z]{16,}\b/g, label: "Stripe key" },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{8,}/g, label: "Slack token" },
];
const AWS_SECRET = /(?<![A-Za-z0-9/+])[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+=])/;
const PLACEHOLDER = /^(x+|\*+|\.+|-+|_+|<.*>|\{\{.*\}\}|todo|tbd|none|null|n\/a|yok|changeme|password|secret)$/i;
/** Shell variables, command substitutions and template tags stand for a secret, they aren't one. */
const REFERENCE = /^\$|\$\{|\$\(|\{\{|%\(/;
/** Fence languages where a lone random line may be a pasted password. */
const PLAIN_FENCES = new Set(["", "text", "txt", "plain", "plaintext"]);

interface Line {
  text: string;
  start: number;
}

export function detectSecrets(note: string, opts: DetectOptions): Finding[] {
  const lines = splitLines(note);
  const blocks = findAllBlocks(note);
  const managed = blocks.filter((b) => MANAGED.has(b.language)).map((b) => [b.start, b.end] as const);
  const code = blocks.filter((b) => PLAIN_FENCES.has(b.language)).map((b) => [b.contentStart, b.contentEnd] as const);
  const inRange = (ranges: readonly (readonly [number, number])[], offset: number) =>
    ranges.some(([a, b]) => offset >= a && offset < b);
  const usable = (i: number) => i < lines.length && !inRange(managed, lines[i].start);

  const found: Finding[] = [];
  const push = (f: Omit<Finding, "line">) => {
    if (f.value.length === 0) return;
    if (f.kind !== "token" && REFERENCE.test(f.value)) return;
    found.push({ ...f, line: lineOf(lines, f.start) });
  };
  const privateKeyLines = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    if (!usable(i) || privateKeyLines.has(i)) continue;
    const { text, start } = lines[i];

    if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(text)) {
      const end = lines.findIndex((l, j) => j > i && /-----END [A-Z0-9 ]*PRIVATE KEY-----/.test(l.text));
      if (end !== -1) {
        const from = start + text.indexOf("-----BEGIN");
        const endLine = lines[end];
        const to = endLine.start + endLine.text.lastIndexOf("-----") + 5;
        push({ kind: "token", confidence: "high", label: "Private key", value: note.slice(from, to), start: from, end: to });
        for (let j = i; j <= end; j++) privateKeyLines.add(j);
        continue;
      }
    }

    for (const t of TOKENS) {
      for (const m of text.matchAll(t.re)) {
        const at = start + m.index!;
        push({ kind: "token", confidence: "high", label: t.label, value: m[0], start: at, end: at + m[0].length });
        if (t.label === "AWS access key") {
          for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 2); j++) {
            if (!usable(j)) continue;
            const s = AWS_SECRET.exec(lines[j].text);
            if (!s) continue;
            const sAt = lines[j].start + s.index;
            push({ kind: "token", confidence: "high", label: "AWS secret key", value: s[0], start: sAt, end: sAt + 40, user: m[0] });
            break;
          }
        }
      }
    }

    for (const m of text.matchAll(DSN)) {
      const pw = m[3];
      const at = start + m.index! + m[1].length + 3 + m[2].length + 1;
      push({
        kind: "dsn", confidence: "high", label: `${m[1]} connection`, value: pw, start: at, end: at + pw.length,
        ...(m[2] && { user: m[2] }), host: m[4],
      });
    }

    for (const re of SQL_PASSWORD) {
      const m = re.exec(text);
      if (!m) continue;
      const at = start + m.index + m[0].length - m[1].length - 1;
      const user = SQL_USER.exec(text)?.[1];
      push({ kind: "sql", confidence: "high", label: "SQL password", value: m[1], start: at, end: at + m[1].length, ...(user && { user }) });
      break;
    }

    const env = ENV.exec(text);
    if (env) {
      if (ENV_SECRET.test(env[1])) {
        const v = cleanValue(env[2]);
        const command = !v?.quoted && /\s/.test(v?.value ?? "");
        if (v && !command && !looksEmpty(v.value) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(v.value)) {
          const at = start + text.indexOf(env[2], text.indexOf("=")) + v.offset;
          push({ kind: "env", confidence: "medium", label: env[1], value: v.value, start: at, end: at + v.value.length });
        }
      }
      continue;
    }

    // Headings name a topic, they don't hold a value.
    if (/^\s*#{1,6}\s/.test(text)) continue;

    const same = SAME_LINE.exec(text);
    if (same?.groups) {
      const raw = same.groups.value;
      const v = cleanValue(raw);
      if (v && !looksEmpty(v.value) && (v.quoted || !/\s/.test(v.value))) {
        const at = start + text.length - raw.length - (text.length - text.trimEnd().length) + v.offset;
        push({ kind: "labeled", confidence: "high", label: same.groups.label.trim(), value: v.value, start: at, end: at + v.value.length });
      }
      continue;
    }

    const bare = BARE_LABEL.exec(text);
    if (bare?.groups) {
      let j = i + 1;
      while (j < lines.length && lines[j].text.trim() === "" && j - i <= 3) j++;
      if (usable(j)) {
        const next = lines[j].text.trim();
        const plausible = /^\S{4,128}$/.test(next) && classes(next) >= 2 && !looksEmpty(next);
        if (plausible && !next.startsWith("```") && !next.startsWith("#")) {
          const at = lines[j].start + lines[j].text.indexOf(next);
          push({ kind: "labeled", confidence: "high", label: bare.groups.label.trim(), value: next, start: at, end: at + next.length });
        }
      }
      continue;
    }

    const spaced = SPACED.exec(text);
    if (spaced?.groups) {
      const value = spaced.groups.value;
      if (value.length >= 6 && /[\d\W_]/u.test(value) && !looksEmpty(value)) {
        const at = start + text.lastIndexOf(value);
        push({ kind: "labeled", confidence: "medium", label: spaced.groups.label.trim(), value, start: at, end: at + value.length });
      }
    }
  }

  if (opts.unlabeled) {
    for (let i = 0; i < lines.length; i++) {
      if (!inRange(code, lines[i].start) || privateKeyLines.has(i)) continue;
      const t = lines[i].text.trim();
      if (!/^\S{8,64}$/.test(t) || /^(https?:|\/|~|\.\/)/.test(t) || t.includes("://") || classes(t) < 3) continue;
      const at = lines[i].start + lines[i].text.indexOf(t);
      push({ kind: "unlabeled", confidence: "low", label: "unlabeled", value: t, start: at, end: at + t.length });
    }
  }

  return dedupe(found);
}

export function maskSecret(value: string): string {
  return value.length >= 8 ? `${value.slice(0, 2)}••••${value.slice(-2)}` : "••••";
}

const RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };
const KIND_ORDER: FindingKind[] = ["token", "dsn", "sql", "labeled", "env", "unlabeled"];

/** Keeps one finding per overlapping range: higher confidence first, then the more specific kind. */
function dedupe(found: Finding[]): Finding[] {
  const better = (a: Finding, b: Finding) =>
    RANK[a.confidence] - RANK[b.confidence] || KIND_ORDER.indexOf(b.kind) - KIND_ORDER.indexOf(a.kind);
  const kept: Finding[] = [];
  for (const f of [...found].sort((a, b) => better(b, a))) {
    if (!kept.some((k) => f.start < k.end && k.start < f.end)) kept.push(f);
  }
  return kept.sort((a, b) => a.start - b.start);
}

function cleanValue(raw: string): { value: string; offset: number; quoted: boolean } | null {
  const v = raw.trim();
  if (v === "") return null;
  const lead = raw.indexOf(v);
  const q = v[0];
  if (q === '"' || q === "'" || q === "`") {
    const close = v.indexOf(q, 1);
    if (close > 1) return { value: v.slice(1, close), offset: lead + 1, quoted: true };
  }
  return { value: v, offset: lead, quoted: false };
}

function looksEmpty(value: string): boolean {
  return value.length < 4 || PLACEHOLDER.test(value) || value.includes("[[") || /^\/\S*\//.test(value);
}

function classes(t: string): number {
  return [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(t)).length;
}

function splitLines(note: string): Line[] {
  const out: Line[] = [];
  let pos = 0;
  for (const raw of note.split("\n")) {
    out.push({ text: raw.endsWith("\r") ? raw.slice(0, -1) : raw, start: pos });
    pos += raw.length + 1;
  }
  return out;
}

function lineOf(lines: Line[], offset: number): number {
  let i = 0;
  while (i + 1 < lines.length && lines[i + 1].start <= offset) i++;
  return i;
}
