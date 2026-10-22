import type { LedgerSnapshot } from "../index/core";

export interface HeldDevice {
  path: string;
  name: string;
  deviceType?: string;
  model?: string;
  since?: string;
}

export interface HolderGroup {
  holder: string;
  /** Link target when the holder is a [[person note]]. */
  link?: string;
  devices: HeldDevice[];
}

/** Devices grouped by who has them. Retired devices are left out; the rest without a holder are unassigned. */
export function groupByHolder(s: LedgerSnapshot): { groups: HolderGroup[]; unassigned: HeldDevice[] } {
  const groups = new Map<string, HolderGroup>();
  const unassigned: HeldDevice[] = [];
  for (const r of s.resources) {
    if (r.type !== "device" || r.status?.kind === "retired") continue;
    const device: HeldDevice = { path: r.path, name: r.name };
    if (r.deviceType) device.deviceType = r.deviceType;
    if (r.model) device.model = r.model;
    if (r.status?.kind !== "assigned") {
      unassigned.push(device);
      continue;
    }
    if (r.status.since) device.since = r.status.since;
    const who = r.status.who;
    // A linked and a plain-text "Ayşe" are kept apart: only the link points at a person note.
    const key = `${who.link ? "link" : "text"}:${who.display.toLowerCase()}`;
    let group = groups.get(key);
    if (!group) {
      group = { holder: who.display, devices: [], ...(who.link && { link: who.link }) };
      groups.set(key, group);
    }
    group.devices.push(device);
  }
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const sorted = [...groups.values()].sort((a, b) => a.holder.localeCompare(b.holder));
  for (const g of sorted) g.devices.sort(byName);
  return { groups: sorted, unassigned: unassigned.sort(byName) };
}
