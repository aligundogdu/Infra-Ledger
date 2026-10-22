import { describe, expect, it } from "vitest";
import { computeWarnings, daysBetween } from "../../src/inventory/warnings";
import { snapshot } from "./fixture";

const TODAY = "2026-10-22";
const of = (group: string, opts = { warrantyWarnDays: 30, passwordMaxAgeDays: 180 }) =>
  computeWarnings(snapshot, TODAY, opts).filter((w) => w.group === group).map((w) => w.message);

describe("daysBetween", () => {
  it("counts calendar days", () => {
    expect(daysBetween("2026-10-22", "2026-11-05")).toBe(14);
    expect(daysBetween("2026-10-22", "2026-10-22")).toBe(0);
    expect(daysBetween("2026-10-22", "2026-01-01")).toBe(-294);
    expect(daysBetween("2026-10-22", "not a date")).toBeNull();
  });
});

describe("computeWarnings", () => {
  it("flags ended and ending warranties, skipping retired devices", () => {
    expect(of("warranty")).toEqual(["Phone 3: warranty ended 2026-01-01", "Laptop 07: warranty ends in 14 days (2026-11-05)"]);
    expect(of("warranty", { warrantyWarnDays: 0, passwordMaxAgeDays: 180 })).toEqual([]);
  });

  it("flags old passwords and counts credentials without a change date", () => {
    expect(of("password")).toEqual([
      "admin on NAS: changed 659 days ago",
      "2 credentials have no change date yet",
    ]);
    expect(of("password", { warrantyWarnDays: 30, passwordMaxAgeDays: 0 })).toEqual([]);
  });

  it("reports duplicate ids, refs and block problems", () => {
    expect(of("ids")).toEqual(['Duplicate id "box-root" in Box.md and Dup.md']);
    expect(of("refs")).toEqual(['Box.md: no credential with id "missing"']);
    expect(of("blocks")).toEqual(["Broken.md: 1 error, 1 warning", "Dup.md: 1 error"]);
  });

  it("carries the note path for each warning", () => {
    const w = computeWarnings(snapshot, TODAY, { warrantyWarnDays: 30, passwordMaxAgeDays: 180 });
    expect(w.find((x) => x.group === "warranty")!.path).toBe("Work/Phone 3.md");
    expect(w.find((x) => x.message.startsWith("2 credentials"))!.path).toBeUndefined();
  });
});
