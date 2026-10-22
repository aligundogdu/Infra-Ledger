import type { BlockIssue, Credential, CredRef, ParseResult } from "../model";
import { spaceOf, type Space } from "../spaces";
import { guessScope, type NetworkParseResult, type Scope } from "../network/parse";
import { ledgerStatus, type LedgerEvent, type LedgerParseResult, type LedgerStatus } from "../ledger/parse";
import { parseLinkValue } from "../links";

export type ResourceType = "server" | "database" | "cloud" | "service" | "device" | "person" | "location" | "other";
const RESOURCE_TYPES: readonly string[] = ["server", "database", "cloud", "service", "device", "person", "location", "other"];

/** Person and location notes are directory entries: no credentials, no SSH. */
export function isDirectoryType(type: ResourceType): boolean {
  return type === "person" || type === "location";
}

/** Properties that may hold a [[wiki link]] to another note. */
export type LinkField = "provider" | "location" | "assigned_to";

export interface Address {
  value: string;
  isHost: boolean;
  scope: Scope;
  source: "properties" | "network";
  label?: string;
  cidr?: string;
  iface?: string;
  mac?: string;
  gateway?: string;
  vlan?: string;
  note?: string;
  extra: Record<string, string>;
}

export interface Port {
  port: number;
  proto: "tcp" | "udp";
  source: "properties" | "network";
  service?: string;
  note?: string;
  extra: Record<string, string>;
}

export interface Resource {
  path: string;
  name: string;
  type: ResourceType;
  /** In SSH order: properties ips, network block addresses, properties hosts. */
  addresses: Address[];
  ports: Port[];
  url?: string;
  /** Display text; a [[link]] target is in links.provider. */
  provider?: string;
  env?: string;
  location?: string;
  assignedTo?: string;
  deviceType?: string;
  model?: string;
  serial?: string;
  warrantyUntil?: string;
  /** Link targets of link properties, keyed by property name. */
  links: Partial<Record<LinkField, string>>;
  /** Assignment state, for devices and notes with a ledger or assigned_to. */
  status?: LedgerStatus;
  /** Ledger events of the note, newest first. */
  events: LedgerEvent[];
  sshPort: number;
  tags: string[];
  space: string | null;
  /** Problems in the properties, shown to the user. */
  warnings: string[];
}

export interface FileRecord {
  path: string;
  basename: string;
  frontmatter: Record<string, unknown> | null;
  blocks: ParseResult[];
  network?: NetworkParseResult[];
  ledger?: LedgerParseResult[];
}

export interface IndexedCredential {
  cred: Credential;
  path: string;
  resource: Resource | null;
  space: string | null;
  duplicate: boolean;
}

export interface IndexedRef {
  ref: CredRef;
  path: string;
  status: "ok" | "unresolved" | "ambiguous";
  target?: IndexedCredential;
}

export interface SyncCopyHint {
  copyPath: string;
  originalPath: string;
}

export interface LedgerSnapshot {
  resources: Resource[];
  credentials: IndexedCredential[];
  refs: IndexedRef[];
  byId: Map<string, IndexedCredential[]>;
  issues: Map<string, BlockIssue[]>;
  syncCopies: SyncCopyHint[];
}

export const EMPTY_SNAPSHOT: LedgerSnapshot = buildIndex([]);

export function resourceFromFrontmatter(
  path: string,
  basename: string,
  fm: Record<string, unknown> | null,
  space: string | null = null,
  network: NetworkParseResult[] = [],
  ledger: LedgerParseResult[] = [],
): Resource | null {
  if (!fm || fm.type === undefined || fm.type === null || fm.type === "") return null;
  const type = String(fm.type).toLowerCase();
  // Many vaults use `type` for their own notes (project, dashboard...); only ours make a resource.
  if (!RESOURCE_TYPES.includes(type)) return null;
  const { ports, invalid } = parsePorts(fm.ports);
  const blockEntries = network.flatMap((n) => n.entries);
  const resource: Resource = {
    path,
    name: basename,
    type: type as ResourceType,
    addresses: [
      ...parseAddresses(fm.ip, false),
      ...blockEntries.flatMap((e): Address[] => {
        if (e.type !== "address") return [];
        const { type: _t, index: _i, scopeGuessed: _g, ...rest } = e;
        return [{ ...rest, source: "network" }];
      }),
      ...parseAddresses(fm.host, true),
    ],
    ports: [
      ...ports,
      ...blockEntries.flatMap((e): Port[] => {
        if (e.type !== "port") return [];
        const { type: _t, index: _i, ...rest } = e;
        return [{ ...rest, source: "network" }];
      }),
    ],
    sshPort: toPort(fm.ssh_port),
    tags: toTags(fm.tags),
    space,
    links: {},
    events: [],
    warnings: invalid.map((row) => `Port "${row}" is not a number between 1 and 65535.`),
  };
  for (const [key, field] of [["url", "url"], ["env", "env"], ["device_type", "deviceType"], ["model", "model"],
    ["serial", "serial"], ["warranty_until", "warrantyUntil"]] as const) {
    const v = fm[key];
    if (v !== undefined && v !== null && v !== "") resource[field] = String(v);
  }
  for (const [key, field] of [["provider", "provider"], ["location", "location"], ["assigned_to", "assignedTo"]] as const) {
    const value = parseLinkValue(fm[key]);
    if (!value) continue;
    resource[field] = value.display;
    if (value.link) resource.links[key] = value.link;
  }
  const events = ledger.flatMap((l) => l.events);
  resource.events = events;
  if (resource.type === "device" || events.length > 0 || resource.assignedTo) {
    resource.status = ledgerStatus(events, fm.assigned_to);
  }
  return resource;
}

/** Properties ip or host: one value or a list; each row is "value optional label". */
export function parseAddresses(value: unknown, isHost: boolean): Address[] {
  return rows(value).map((row) => {
    const [head, ...rest] = row.split(/\s+/);
    const label = rest.join(" ");
    const [address, cidr] = isHost ? [head] : head.split("/", 2);
    return {
      value: address,
      isHost,
      scope: guessScope(address, isHost),
      source: "properties",
      ...(cidr && { cidr }),
      ...(label && { label }),
      extra: {},
    };
  });
}

export function parsePorts(value: unknown): { ports: Port[]; invalid: string[] } {
  const ports: Port[] = [];
  const invalid: string[] = [];
  for (const row of rows(value)) {
    const [head, ...rest] = row.split(/\s+/);
    const port = /^\d+$/.test(head) ? Number(head) : NaN;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      invalid.push(row);
      continue;
    }
    const service = rest.join(" ");
    ports.push({ port, proto: "tcp", source: "properties", ...(service && { service }), extra: {} });
  }
  return { ports, invalid };
}

function rows(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [value];
  return list
    .filter((v) => v !== undefined && v !== null)
    .map((v) => String(v).trim())
    .filter(Boolean);
}

export function buildIndex(files: FileRecord[], spaces: Space[] = []): LedgerSnapshot {
  const resources: Resource[] = [];
  const credentials: IndexedCredential[] = [];
  const pendingRefs: { ref: CredRef; path: string }[] = [];
  const byId = new Map<string, IndexedCredential[]>();
  const issues = new Map<string, BlockIssue[]>();

  for (const f of files) {
    const space = spaceOf(f.path, spaces);
    const resource = resourceFromFrontmatter(f.path, f.basename, f.frontmatter, space, f.network, f.ledger);
    if (resource) resources.push(resource);
    const fileIssues = [...f.blocks, ...(f.network ?? []), ...(f.ledger ?? [])].flatMap((b) => b.issues);
    if (fileIssues.length > 0) issues.set(f.path, fileIssues);
    for (const block of f.blocks) {
      for (const entry of block.entries) {
        if (entry.type === "ref") {
          pendingRefs.push({ ref: entry, path: f.path });
          continue;
        }
        const ic: IndexedCredential = { cred: entry, path: f.path, resource, space, duplicate: false };
        credentials.push(ic);
        const list = byId.get(entry.id);
        if (list) list.push(ic);
        else byId.set(entry.id, [ic]);
      }
    }
  }

  for (const list of byId.values()) {
    if (list.length > 1) for (const ic of list) ic.duplicate = true;
  }

  const refs: IndexedRef[] = pendingRefs.map(({ ref, path }) => {
    const targets = byId.get(ref.ref) ?? [];
    if (targets.length === 0) return { ref, path, status: "unresolved" };
    if (targets.length > 1) return { ref, path, status: "ambiguous" };
    return { ref, path, status: "ok", target: targets[0] };
  });

  return { resources, credentials, refs, byId, issues, syncCopies: findSyncCopies(credentials, byId) };
}

/** A file whose every id also lives in exactly one other file is probably a sync conflict copy. */
function findSyncCopies(credentials: IndexedCredential[], byId: Map<string, IndexedCredential[]>): SyncCopyHint[] {
  const idsByPath = new Map<string, string[]>();
  for (const ic of credentials) {
    const ids = idsByPath.get(ic.path);
    if (ids) ids.push(ic.cred.id);
    else idsByPath.set(ic.path, [ic.cred.id]);
  }
  const hints: SyncCopyHint[] = [];
  const seen = new Set<string>();
  for (const [path, ids] of idsByPath) {
    let other: string | null = null;
    const allShared = ids.every((id) => {
      const elsewhere = (byId.get(id) ?? []).filter((ic) => ic.path !== path).map((ic) => ic.path);
      if (elsewhere.length !== 1) return false;
      other ??= elsewhere[0];
      return elsewhere[0] === other;
    });
    if (!allShared || other === null) continue;
    if ((idsByPath.get(other)?.length ?? 0) !== ids.length) continue;
    const key = [path, other].sort().join("\0");
    if (seen.has(key)) continue;
    seen.add(key);
    // The longer name is usually the copy ("Home 2.md", "Home (conflict).md").
    const [originalPath, copyPath] = [path, other as string].sort((a, b) => a.length - b.length || a.localeCompare(b));
    hints.push({ copyPath, originalPath });
  }
  return hints;
}

function toPort(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : 22;
}

function toTags(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value];
  return list.map((t) => String(t).replace(/^#/, "")).filter(Boolean);
}
