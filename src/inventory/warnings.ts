import type { LedgerSnapshot } from "../index/core";

export type WarningGroup = "warranty" | "password" | "ids" | "refs" | "sync" | "blocks";

export interface Warning {
  group: WarningGroup;
  message: string;
  /** Note to open; missing for summary lines. */
  path?: string;
}

export interface WarningOptions {
  /** 0 turns the check off. */
  warrantyWarnDays: number;
  passwordMaxAgeDays: number;
}

const DAY = 86_400_000;

/** Whole days from a to b (YYYY-MM-DD), or null if either isn't a date. */
export function daysBetween(a: string, b: string): number | null {
  const [x, y] = [Date.parse(`${a}T00:00:00Z`), Date.parse(`${b}T00:00:00Z`)];
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return Math.round((y - x) / DAY);
}

export function computeWarnings(s: LedgerSnapshot, today: string, opts: WarningOptions): Warning[] {
  const out: Warning[] = [];
  const file = (path: string) => path.split("/").pop() ?? path;

  if (opts.warrantyWarnDays > 0) {
    const devices = s.resources
      .filter((r) => r.type === "device" && r.warrantyUntil && r.status?.kind !== "retired")
      .sort((a, b) => a.warrantyUntil!.localeCompare(b.warrantyUntil!));
    for (const r of devices) {
      const days = daysBetween(today, r.warrantyUntil!);
      if (days === null) continue;
      if (days < 0) out.push({ group: "warranty", message: `${r.name}: warranty ended ${r.warrantyUntil}`, path: r.path });
      else if (days <= opts.warrantyWarnDays) {
        out.push({ group: "warranty", message: `${r.name}: warranty ends in ${days} days (${r.warrantyUntil})`, path: r.path });
      }
    }
  }

  if (opts.passwordMaxAgeDays > 0) {
    let undated = 0;
    const old: { days: number; message: string; path: string }[] = [];
    for (const ic of s.credentials) {
      if (ic.cred.secret === undefined && !ic.cred.updated) continue;
      const days = ic.cred.updated ? daysBetween(ic.cred.updated, today) : null;
      if (days === null) {
        undated++;
      } else if (days > opts.passwordMaxAgeDays) {
        const owner = ic.resource?.name ?? file(ic.path).replace(/\.md$/, "");
        old.push({ days, message: `${ic.cred.label} on ${owner}: changed ${days} days ago`, path: ic.path });
      }
    }
    old.sort((a, b) => b.days - a.days);
    for (const o of old) out.push({ group: "password", message: o.message, path: o.path });
    if (undated > 0) {
      out.push({ group: "password", message: `${undated} credential${undated === 1 ? " has" : "s have"} no change date yet` });
    }
  }

  for (const [id, list] of s.byId) {
    if (list.length < 2) continue;
    const files = [...new Set(list.map((ic) => file(ic.path)))].sort();
    out.push({ group: "ids", message: `Duplicate id "${id}" in ${files.join(" and ")}`, path: list[0].path });
  }

  for (const r of s.refs) {
    if (r.status === "unresolved") {
      out.push({ group: "refs", message: `${file(r.path)}: no credential with id "${r.ref.ref}"`, path: r.path });
    } else if (r.status === "ambiguous") {
      out.push({ group: "refs", message: `${file(r.path)}: id "${r.ref.ref}" is defined in more than one note`, path: r.path });
    }
  }

  for (const hint of s.syncCopies) {
    out.push({ group: "sync", message: `${file(hint.copyPath)} looks like a sync copy of ${file(hint.originalPath)}`, path: hint.copyPath });
  }

  const paths = new Set([...s.issues.keys(), ...s.resources.filter((r) => r.warnings.length > 0).map((r) => r.path)]);
  for (const path of [...paths].sort()) {
    const issues = s.issues.get(path) ?? [];
    const errors = issues.filter((i) => i.level === "error").length;
    const warnings =
      issues.filter((i) => i.level === "warning").length + (s.resources.find((r) => r.path === path)?.warnings.length ?? 0);
    const parts = [errors && `${errors} error${errors === 1 ? "" : "s"}`, warnings && `${warnings} warning${warnings === 1 ? "" : "s"}`];
    out.push({ group: "blocks", message: `${file(path)}: ${parts.filter(Boolean).join(", ")}`, path });
  }
  return out;
}
