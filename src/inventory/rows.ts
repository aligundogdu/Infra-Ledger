import type { LedgerSnapshot, Resource, ResourceType } from "../index/core";
import { normalize, parseQuery, resourceTerms } from "../util/search";

export interface InventoryRow {
  path: string;
  name: string;
  type: ResourceType;
  space?: string;
  /** device_type for devices, env for the rest. */
  detail?: string;
  provider?: string;
  location?: string;
  holder?: string;
  addresses: number;
  /** Own credentials plus refs that resolve. */
  credentials: number;
  haystack: string;
  resource: Resource;
}

export interface Filters {
  text: string;
  type?: string;
  space?: string;
  provider?: string;
  location?: string;
  holder?: string;
}

export type SortKey = "name" | "type" | "space" | "detail" | "provider" | "location" | "holder" | "addresses" | "credentials";
export type SortDir = "asc" | "desc";

const OPTION_FIELDS = ["type", "space", "provider", "location", "holder"] as const;
export type OptionField = (typeof OPTION_FIELDS)[number];

export function buildRows(s: LedgerSnapshot): InventoryRow[] {
  return s.resources.map((r) => {
    const own = s.credentials.filter((c) => c.path === r.path).length;
    const refs = s.refs.filter((x) => x.path === r.path && x.status === "ok").length;
    const holder = r.status?.kind === "assigned" ? r.status.who.display : undefined;
    const row: InventoryRow = {
      path: r.path,
      name: r.name,
      type: r.type,
      addresses: r.addresses.length,
      credentials: own + refs,
      haystack: normalize([r.name, ...resourceTerms(r)].join(" ")),
      resource: r,
    };
    const detail = r.type === "device" ? r.deviceType : r.env;
    for (const [key, value] of [["space", r.space], ["detail", detail], ["provider", r.provider],
      ["location", r.location], ["holder", holder]] as const) {
      if (value) row[key] = value;
    }
    return row;
  });
}

export function filterRows(rows: InventoryRow[], f: Filters, spaceNames: string[]): InventoryRow[] {
  const q = parseQuery(f.text, spaceNames);
  if (q.unknownSpace !== null) return [];
  return rows.filter(
    (r) =>
      (!q.space || r.space === q.space) &&
      q.tokens.every((t) => r.haystack.includes(t)) &&
      OPTION_FIELDS.every((k) => !f[k] || r[k] === f[k]),
  );
}

export function sortRows(rows: InventoryRow[], key: SortKey, dir: SortDir): InventoryRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const [x, y] = [a[key], b[key]];
    if (typeof x === "number" && typeof y === "number") return sign * (x - y) || a.name.localeCompare(b.name);
    // Empty values go last whatever the direction.
    if (!x && y) return 1;
    if (x && !y) return -1;
    return sign * String(x ?? "").localeCompare(String(y ?? "")) || a.name.localeCompare(b.name);
  });
}

export function filterOptions(rows: InventoryRow[]): Record<OptionField, string[]> {
  const out = {} as Record<OptionField, string[]>;
  for (const k of OPTION_FIELDS) {
    out[k] = [...new Set(rows.map((r) => r[k]).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
  }
  return out;
}

/** Columns worth showing for these rows: name always, others only if some row has a value (or a count above 0). */
export function usedColumns(rows: InventoryRow[], keys: SortKey[]): SortKey[] {
  return keys.filter((k) => k === "name" || rows.some((r) => (typeof r[k] === "number" ? (r[k] as number) > 0 : !!r[k])));
}
