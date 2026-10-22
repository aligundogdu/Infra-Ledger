import { describe, expect, it } from "vitest";
import { groupByHolder } from "../../src/inventory/people";
import { snapshot } from "./fixture";

describe("groupByHolder", () => {
  it("groups assigned devices by person and lists the unassigned ones", () => {
    const { groups, unassigned } = groupByHolder(snapshot);
    expect(groups.map((g) => [g.holder, g.link ?? null, g.devices.map((d) => d.name)])).toEqual([
      ["Ayşe Yılmaz", "Ayşe Yılmaz", ["Laptop 07", "Phone 3"]],
      ["Guest", null, ["Laptop 09"]],
    ]);
    expect(groups[0].devices[0]).toMatchObject({ deviceType: "laptop", model: "MBP 14", since: "2026-10-22" });
    expect(unassigned.map((d) => d.name)).toEqual(["Printer"]);
  });
});
