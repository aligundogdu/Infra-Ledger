import type { LedgerSnapshot, LinkField, Resource } from "../index/core";
import type { LinkValue } from "../links";

export interface RelatedItem {
  path: string;
  name: string;
  type: string;
  detail?: string;
  since?: string;
}

export interface HeldPeriod {
  path: string;
  name: string;
  from: string;
  until: string;
}

export interface Related {
  /** Devices assigned to this note now. */
  holding: RelatedItem[];
  /** Earlier assignments to this note that have ended. */
  held: HeldPeriod[];
  /** Resources whose location is this note. */
  located: RelatedItem[];
  /** Resources whose provider is this note. */
  provided: RelatedItem[];
}

/** Resolves a [[link]] written in `from` to a note path, or null. */
export type LinkResolver = (link: string, from: string) => string | null;

/** Everything in the index that points at one note, through a link or the note's exact name. */
export function relatedTo(s: LedgerSnapshot, path: string, name: string, resolve: LinkResolver): Related {
  const lower = name.toLowerCase();
  const points = (r: Resource, value: LinkValue | undefined) =>
    !!value && (value.link ? resolve(value.link, r.path) === path : value.display.toLowerCase() === lower);
  const field = (r: Resource, key: LinkField, display?: string) =>
    points(r, display ? { display, ...(r.links[key] && { link: r.links[key] }) } : undefined);

  const out: Related = { holding: [], held: [], located: [], provided: [] };
  for (const r of s.resources) {
    if (r.path === path) continue;
    const item: RelatedItem = { path: r.path, name: r.name, type: r.type };
    const detail = r.type === "device" ? r.deviceType : r.env;
    if (detail) item.detail = detail;

    if (r.status?.kind === "assigned" && points(r, r.status.who)) {
      out.holding.push(r.status.since ? { ...item, since: r.status.since } : item);
    }
    if (field(r, "location", r.location)) out.located.push(item);
    if (field(r, "provider", r.provider)) out.provided.push(item);

    // Walk the log oldest first: an assignment to this note opens a period, the next return or reassignment closes it.
    let open: string | null = null;
    for (const e of [...r.events].reverse()) {
      if (e.event === "assigned") {
        if (open && !points(r, e.to)) {
          out.held.push({ path: r.path, name: r.name, from: open, until: e.date });
          open = null;
        }
        if (points(r, e.to)) open ??= e.date;
      } else if ((e.event === "returned" || e.event === "retired" || e.event === "lost") && open) {
        out.held.push({ path: r.path, name: r.name, from: open, until: e.date });
        open = null;
      }
    }
  }

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  out.holding.sort(byName);
  out.located.sort(byName);
  out.provided.sort(byName);
  out.held.sort((a, b) => b.until.localeCompare(a.until) || byName(a, b));
  return out;
}
