import type { BlockIssue, Credential, CredRef, ParseResult } from "../model";

export type ResourceType = "server" | "database" | "cloud" | "service" | "other";
const RESOURCE_TYPES: readonly string[] = ["server", "database", "cloud", "service", "other"];

export interface Resource {
  path: string;
  name: string;
  type: ResourceType;
  ip?: string;
  host?: string;
  url?: string;
  provider?: string;
  env?: string;
  sshPort: number;
  tags: string[];
}

export interface FileRecord {
  path: string;
  basename: string;
  frontmatter: Record<string, unknown> | null;
  blocks: ParseResult[];
}

export interface IndexedCredential {
  cred: Credential;
  path: string;
  resource: Resource | null;
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
): Resource | null {
  if (!fm || fm.type === undefined || fm.type === null || fm.type === "") return null;
  const type = String(fm.type).toLowerCase();
  const resource: Resource = {
    path,
    name: basename,
    type: (RESOURCE_TYPES.includes(type) ? type : "other") as ResourceType,
    sshPort: toPort(fm.ssh_port),
    tags: toTags(fm.tags),
  };
  for (const key of ["ip", "host", "url", "provider", "env"] as const) {
    const v = fm[key];
    if (v !== undefined && v !== null && v !== "") resource[key] = String(v);
  }
  return resource;
}

export function buildIndex(files: FileRecord[]): LedgerSnapshot {
  const resources: Resource[] = [];
  const credentials: IndexedCredential[] = [];
  const pendingRefs: { ref: CredRef; path: string }[] = [];
  const byId = new Map<string, IndexedCredential[]>();
  const issues = new Map<string, BlockIssue[]>();

  for (const f of files) {
    const resource = resourceFromFrontmatter(f.path, f.basename, f.frontmatter);
    if (resource) resources.push(resource);
    const fileIssues = f.blocks.flatMap((b) => b.issues);
    if (fileIssues.length > 0) issues.set(f.path, fileIssues);
    for (const block of f.blocks) {
      for (const entry of block.entries) {
        if (entry.type === "ref") {
          pendingRefs.push({ ref: entry, path: f.path });
          continue;
        }
        const ic: IndexedCredential = { cred: entry, path: f.path, resource, duplicate: false };
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
