import { isMap, isScalar, isSeq, type YAMLMap } from "yaml";
import { parseListBlock } from "../creds/list-block";
import { readRawString } from "../creds/raw-scalar";
import type { BlockIssue } from "../model";

export const SCOPES = ["public", "private", "vpn", "other"] as const;
export type Scope = (typeof SCOPES)[number];

export interface NetAddress {
  type: "address";
  /** Address without CIDR suffix. */
  value: string;
  isHost: boolean;
  cidr?: string;
  scope: Scope;
  scopeGuessed: boolean;
  label?: string;
  iface?: string;
  mac?: string;
  gateway?: string;
  vlan?: string;
  note?: string;
  /** Fields Infra Ledger doesn't know, kept as text. */
  extra: Record<string, string>;
  index: number;
}

export interface NetPort {
  type: "port";
  port: number;
  proto: "tcp" | "udp";
  service?: string;
  note?: string;
  extra: Record<string, string>;
  index: number;
}

export type NetEntry = NetAddress | NetPort;

export interface NetworkParseResult {
  entries: NetEntry[];
  issues: BlockIssue[];
  ok: boolean;
}

const ADDRESS_FIELDS = ["ip", "host", "scope", "label", "iface", "mac", "gateway", "vlan", "note"] as const;
const PORT_FIELDS = ["port", "proto", "service", "note"] as const;

export function parseNetworkBlock(text: string): NetworkParseResult {
  const block = parseListBlock(text, "network");
  if (block.kind === "empty") return { entries: [], issues: [], ok: true };
  if (block.kind === "error") return { entries: [], issues: [block.issue], ok: false };

  const entries: NetEntry[] = [];
  const issues: BlockIssue[] = [];
  block.seq.items.forEach((item, index) => {
    const line = block.lineOf((item as { range?: [number, number, number] }).range?.[0]);
    const warn = (code: BlockIssue["code"], message: string) => issues.push({ level: "warning", code, message, line, index });

    if (!isMap(item)) {
      warn("invalid-network-entry", "Each entry needs an ip, a host or a port.");
      return;
    }
    const fields = readFields(item, text);

    if (fields.ip !== undefined || fields.host !== undefined) {
      const isHost = fields.ip === undefined;
      const [value, cidr] = isHost ? [fields.host!] : fields.ip!.split("/", 2);
      const scope = toScope(fields.scope);
      const address: NetAddress = {
        type: "address",
        value,
        isHost,
        scope: scope ?? guessScope(value, isHost),
        scopeGuessed: fields.scope === undefined,
        extra: extraFields(item, text, ADDRESS_FIELDS),
        index,
      };
      if (cidr) address.cidr = cidr;
      for (const key of ["label", "iface", "mac", "gateway", "vlan", "note"] as const) {
        if (fields[key] !== undefined) address[key] = fields[key];
      }
      entries.push(address);
      return;
    }

    if (fields.port !== undefined) {
      const port = /^\d+$/.test(fields.port) ? Number(fields.port) : NaN;
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        warn("invalid-port", `Port "${fields.port}" is not a number between 1 and 65535.`);
        return;
      }
      const entry: NetPort = {
        type: "port",
        port,
        proto: fields.proto?.toLowerCase() === "udp" ? "udp" : "tcp",
        extra: extraFields(item, text, PORT_FIELDS),
        index,
      };
      if (fields.service !== undefined) entry.service = fields.service;
      if (fields.note !== undefined) entry.note = fields.note;
      entries.push(entry);
      return;
    }

    warn("invalid-network-entry", "Each entry needs an ip, a host or a port.");
  });
  return { entries, issues, ok: true };
}

/** Best guess when no scope is written: RFC 1918 and ULA are private, CGNAT (Tailscale) is vpn. */
export function guessScope(value: string, isHost: boolean): Scope {
  if (isHost) return "public";
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(value);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 127) return "private";
    if (a === 100 && b >= 64 && b <= 127) return "vpn";
    return "public";
  }
  const lower = value.toLowerCase();
  if (/^f[cd][0-9a-f]{0,2}:/.test(lower) || /^fe[89ab][0-9a-f]?:/.test(lower) || lower === "::1") return "private";
  return "public";
}

function toScope(value: string | undefined): Scope | undefined {
  if (value === undefined) return undefined;
  const v = value.toLowerCase();
  return (SCOPES as readonly string[]).includes(v) ? (v as Scope) : "other";
}

function readFields(map: YAMLMap, text: string): Partial<Record<string, string>> {
  const out: Partial<Record<string, string>> = {};
  for (const pair of map.items) {
    const key = isScalar(pair.key) ? String(pair.key.value) : null;
    if (key === null || isMap(pair.value) || isSeq(pair.value)) continue;
    const value = readRawString(pair.value, text);
    if (value !== null) out[key] = value;
  }
  return out;
}

function extraFields(map: YAMLMap, text: string, known: readonly string[]): Record<string, string> {
  const extra: Record<string, string> = {};
  for (const pair of map.items) {
    const key = isScalar(pair.key) ? String(pair.key.value) : null;
    if (key === null || known.includes(key)) continue;
    if (isSeq(pair.value)) {
      extra[key] = pair.value.items.map((i) => readRawString(i, text) ?? "").filter(Boolean).join(", ");
    } else if (isMap(pair.value)) {
      extra[key] = JSON.stringify(pair.value.toJSON());
    } else {
      const value = readRawString(pair.value, text);
      if (value !== null) extra[key] = value;
    }
  }
  return extra;
}
