import type { IndexedCredential, LedgerSnapshot, Resource } from "../index/core";

export interface SearchItem {
  kind: "credential" | "resource";
  space: string | null;
  title: string;
  subtitle: string;
  haystack: string;
  path: string;
  resource: Resource | null;
  credential?: IndexedCredential;
}

export function buildSearchItems(s: LedgerSnapshot): SearchItem[] {
  const items: SearchItem[] = [];
  const withCreds = new Set<string>();

  for (const ic of s.credentials) {
    withCreds.add(ic.path);
    items.push(credentialItem(ic, ic.resource, ic.path, false));
  }
  for (const r of s.refs) {
    if (r.status !== "ok" || !r.target) continue;
    withCreds.add(r.path);
    const resource = s.resources.find((res) => res.path === r.path) ?? null;
    items.push(credentialItem(r.target, resource, r.path, true));
  }
  for (const res of s.resources) {
    if (withCreds.has(res.path)) continue;
    items.push({
      kind: "resource",
      space: res.space,
      title: res.name,
      subtitle: describe(res, res.space, null),
      haystack: normalize([res.name, ...resourceTerms(res)].join(" ")),
      path: res.path,
      resource: res,
    });
  }
  return items.sort((a, b) => a.title.localeCompare(b.title));
}

export interface ParsedQuery {
  tokens: string[];
  space: string | null;
  /** The text after @ when it names no space. */
  unknownSpace: string | null;
}

/** Splits a query into search tokens and an optional "@space" filter. */
export function parseQuery(query: string, spaceNames: string[]): ParsedQuery {
  const parts = normalize(query).split(/\s+/).filter(Boolean);
  const at = parts.find((p) => p.startsWith("@") && p.length > 1);
  const tokens = parts.filter((p) => p !== at && p !== "@");
  if (!at) return { tokens, space: null, unknownSpace: null };
  const wanted = at.slice(1);
  const space = spaceNames.find((n) => normalize(n).replace(/\s+/g, "").startsWith(wanted)) ?? null;
  return { tokens, space, unknownSpace: space ? null : wanted };
}

export function matchItems(query: string, items: SearchItem[], spaceNames: string[] = []): SearchItem[] {
  const { tokens, space, unknownSpace } = parseQuery(query, spaceNames);
  if (unknownSpace !== null) return [];
  const pool = space ? items.filter((i) => i.space === space) : items;
  if (tokens.length === 0) return pool;
  const scored: { item: SearchItem; score: number }[] = [];
  for (const item of pool) {
    if (!tokens.every((t) => item.haystack.includes(t))) continue;
    const title = normalize(item.title);
    let score = 0;
    for (const t of tokens) {
      if (title.includes(t)) score += 2;
      if (new RegExp(`(^|[^a-z0-9])${escape(t)}`).test(title)) score += 1;
    }
    scored.push({ item, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title)).map((s) => s.item);
}

function credentialItem(ic: IndexedCredential, resource: Resource | null, path: string, viaRef: boolean): SearchItem {
  const owner = resource?.name ?? fileBase(path);
  const space = viaRef ? (resource?.space ?? null) : ic.space;
  const c = ic.cred;
  const terms = [owner, c.label, c.user, c.kind, c.id, ...(resource ? resourceTerms(resource) : [])];
  return {
    kind: "credential",
    space,
    title: `${owner} › ${c.label}${c.user ? ` (${c.user})` : ""}`,
    subtitle: describe(resource, space, viaRef ? `via ref from ${fileBase(ic.path)}` : c.kind),
    haystack: normalize(terms.filter(Boolean).join(" ")),
    path,
    resource,
    credential: ic,
  };
}

function resourceTerms(r: Resource): string[] {
  const addresses = [...r.ips, ...r.hosts].flatMap((a) => [a.value, a.label]);
  const ports = r.ports.flatMap((p) => [String(p.port), p.label]);
  return [r.type, r.provider, r.env, r.space, ...addresses, ...ports, ...r.tags].filter((x): x is string => !!x);
}

function describe(r: Resource | null, space: string | null, extra: string | null): string {
  const parts = r ? [r.type, r.env, (r.ips[0] ?? r.hosts[0])?.value] : ["no resource"];
  return [space, ...parts, extra].filter(Boolean).join(" · ");
}

function normalize(text: string): string {
  return text
    .toLocaleLowerCase("en")
    .replace(/ı/g, "i")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escape(t: string): string {
  return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fileBase(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/, "");
}
