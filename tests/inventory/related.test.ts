import { describe, expect, it } from "vitest";
import { buildIndex } from "../../src/index/core";
import { relatedTo } from "../../src/inventory/related";
import { file } from "./fixture";

const snapshot = buildIndex([
  file("Assets/Laptop 07.md", { type: "device", device_type: "laptop", model: "MBP", assigned_to: "[[Ayşe Yılmaz]]", location: "[[Office 2F]]" }, [], [
    `- date: 2026-10-22
  event: assigned
  to: "[[Ayşe Yılmaz]]"
- date: 2026-10-22
  event: returned
  from: "[[Mehmet Kaya]]"
- date: 2026-06-15
  event: assigned
  to: "[[Mehmet Kaya]]"
`,
  ]),
  file("Assets/Phone 3.md", { type: "device", device_type: "phone", assigned_to: "Ayşe Yılmaz" }),
  file("Assets/Old Mouse.md", { type: "device" }, [], [
    `- date: 2026-03-01
  event: returned
  from: "[[Ayşe Yılmaz]]"
- date: 2026-01-10
  event: assigned
  to: "[[Ayşe Yılmaz]]"
`,
  ]),
  file("Infra/Box.md", { type: "server", provider: "[[Hetzner]]", location: "Office 2F" }),
  file("Infra/Other.md", { type: "server", provider: "[[Hetzner Cloud]]" }),
  file("People/Ayşe Yılmaz.md", { type: "person" }),
  file("People/Mehmet Kaya.md", { type: "person" }),
  file("Locations/Office 2F.md", { type: "location" }),
  file("Infra/Hetzner.md", { type: "cloud" }),
]);

// Link targets resolve by note name, like Obsidian does for unique names.
const resolve = (link: string) => snapshot.resources.find((r) => r.name === link)?.path ?? null;

describe("relatedTo", () => {
  it("lists a person's current devices, linked or by plain name, and past periods", () => {
    const r = relatedTo(snapshot, "People/Ayşe Yılmaz.md", "Ayşe Yılmaz", resolve);
    expect(r.holding.map((d) => [d.name, d.since ?? null])).toEqual([["Laptop 07", "2026-10-22"], ["Phone 3", null]]);
    expect(r.held.map((p) => [p.name, p.from, p.until])).toEqual([["Old Mouse", "2026-01-10", "2026-03-01"]]);
    expect(r.located).toEqual([]);
  });

  it("closes a period when the device goes to someone else", () => {
    const r = relatedTo(snapshot, "People/Mehmet Kaya.md", "Mehmet Kaya", resolve);
    expect(r.holding).toEqual([]);
    expect(r.held.map((p) => [p.name, p.from, p.until])).toEqual([["Laptop 07", "2026-06-15", "2026-10-22"]]);
  });

  it("lists what is at a location and what a provider hosts", () => {
    expect(relatedTo(snapshot, "Locations/Office 2F.md", "Office 2F", resolve).located.map((x) => x.name)).toEqual(["Box", "Laptop 07"]);
    const h = relatedTo(snapshot, "Infra/Hetzner.md", "Hetzner", resolve);
    expect(h.provided.map((x) => x.name)).toEqual(["Box"]);
    expect(h.holding).toEqual([]);
  });
});
