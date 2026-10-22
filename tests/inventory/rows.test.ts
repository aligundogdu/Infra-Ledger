import { describe, expect, it } from "vitest";
import { buildRows, filterOptions, filterRows, sortRows, usedColumns } from "../../src/inventory/rows";
import { snapshot, SPACES } from "./fixture";

const names = (rows: { name: string }[]) => rows.map((r) => r.name);
const spaceNames = SPACES.map((s) => s.name);

describe("buildRows", () => {
  it("summarises each resource", () => {
    const rows = buildRows(snapshot);
    const box = rows.find((r) => r.name === "Box")!;
    expect(box).toMatchObject({
      type: "server", space: "Work", detail: "prod", provider: "Hetzner", location: "FSN1", addresses: 0, credentials: 2,
    });
    expect(rows.find((r) => r.name === "Laptop 07")).toMatchObject({ detail: "laptop", holder: "Ayşe Yılmaz", location: "Office 2F" });
    expect(rows.find((r) => r.name === "NAS")).toMatchObject({ addresses: 1, credentials: 3, space: "Personal" });
  });
});

describe("filterRows", () => {
  const rows = buildRows(snapshot);
  it("filters by each field and combines them", () => {
    expect(names(filterRows(rows, { text: "", type: "server" }, spaceNames))).toEqual(["NAS", "Box", "Dup", "Broken"]);
    expect(names(filterRows(rows, { text: "", holder: "Ayşe Yılmaz" }, spaceNames))).toEqual(["Laptop 07", "Phone 3"]);
    expect(names(filterRows(rows, { text: "", type: "device", location: "Office 2F" }, spaceNames))).toEqual(["Laptop 07"]);
    expect(names(filterRows(rows, { text: "", space: "Personal", provider: "Synology" }, spaceNames))).toEqual(["NAS"]);
  });
  it("matches free text and @space like search", () => {
    expect(names(filterRows(rows, { text: "laptop" }, spaceNames))).toEqual(["Laptop 07", "Laptop 09"]);
    expect(names(filterRows(rows, { text: "@personal 192.168" }, spaceNames))).toEqual(["NAS"]);
    expect(filterRows(rows, { text: "@nowhere" }, spaceNames)).toEqual([]);
  });
});

describe("sortRows", () => {
  const rows = filterRows(buildRows(snapshot), { text: "", type: "server" }, spaceNames);
  it("sorts by text and number columns both ways, empty values last", () => {
    expect(names(sortRows(rows, "name", "asc"))).toEqual(["Box", "Broken", "Dup", "NAS"]);
    expect(names(sortRows(rows, "credentials", "desc"))).toEqual(["NAS", "Box", "Dup", "Broken"]);
    expect(names(sortRows(rows, "provider", "asc"))).toEqual(["Box", "NAS", "Broken", "Dup"]);
    expect(names(sortRows(rows, "provider", "desc"))).toEqual(["NAS", "Box", "Broken", "Dup"]);
  });
});

describe("filterOptions", () => {
  it("lists the distinct values present", () => {
    const o = filterOptions(buildRows(snapshot));
    expect(o.type).toEqual(["device", "person", "server"]);
    expect(o.space).toEqual(["Personal", "Work"]);
    expect(o.holder).toEqual(["Ayşe Yılmaz", "Guest"]);
    expect(o.location).toEqual(["FSN1", "Office 2F"]);
  });
});

describe("usedColumns", () => {
  it("keeps name and drops columns empty or zero in every row", () => {
    const rows = filterRows(buildRows(snapshot), { text: "", type: "server" }, spaceNames);
    expect(usedColumns(rows, ["name", "type", "detail", "location", "holder", "addresses", "credentials"])).toEqual([
      "name", "type", "detail", "location", "addresses", "credentials",
    ]);
    const devices = filterRows(buildRows(snapshot), { text: "", type: "device" }, spaceNames);
    expect(usedColumns(devices, ["name", "provider", "addresses"])).toEqual(["name"]);
  });
});
