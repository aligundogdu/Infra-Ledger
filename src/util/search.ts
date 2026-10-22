import type { IndexedCredential, LedgerSnapshot, Resource } from "../index/core";

export interface SearchItem {
  kind: "credential" | "resource";
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
      title: res.name,
      subtitle: describe(res, null),
      haystack: normalize([res.name, ...resourceTerms(res)].join(" ")),
      path: res.path,
      resource: res,
    });
  }
  return items.sort((a, b) => a.title.localeCompare(b.title));
}

export function matchItems(query: string, items: SearchItem[]): SearchItem[] {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return items;
  const scored: { item: SearchItem; score: number }[] = [];
  for (const item of items) {
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
  const c = ic.cred;
  const terms = [owner, c.label, c.user, c.kind, c.id, ...(resource ? resourceTerms(resource) : [])];
  return {
    kind: "credential",
    title: `${owner} › ${c.label}${c.user ? ` (${c.user})` : ""}`,
    subtitle: describe(resource, viaRef ? `via ref from ${fileBase(ic.path)}` : c.kind),
    haystack: normalize(terms.filter(Boolean).join(" ")),
    path,
    resource,
    credential: ic,
  };
}

function resourceTerms(r: Resource): string[] {
  return [r.type, r.ip, r.host, r.provider, r.env, ...r.tags].filter((x): x is string => !!x);
}

function describe(r: Resource | null, extra: string | null): string {
  const parts = r ? [r.type, r.env, r.ip ?? r.host] : ["no resource"];
  return [...parts, extra].filter(Boolean).join(" · ");
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
