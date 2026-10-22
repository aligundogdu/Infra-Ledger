import { describe, expect, it } from "vitest";
import { migrateSpaces, spaceOf } from "../src/spaces";

describe("migrateSpaces", () => {
  it("turns the old single folder into one space", () => {
    expect(migrateSpaces({ resourceFolder: "Servers" })).toEqual([{ name: "Servers", folder: "Servers" }]);
  });
  it("keeps an existing list and defaults when nothing is set", () => {
    const spaces = [{ name: "Work", folder: "Work/Infra" }];
    expect(migrateSpaces({ spaces, resourceFolder: "Old" })).toEqual(spaces);
    expect(migrateSpaces({})).toEqual([{ name: "Infra", folder: "Infra" }]);
    expect(migrateSpaces({ resourceFolder: "" })).toEqual([{ name: "Vault", folder: "" }]);
  });
});

describe("spaceOf", () => {
  const spaces = [{ name: "Root", folder: "" }, { name: "Work", folder: "Work" }, { name: "Deep", folder: "Work/Deep/" }];
  it("prefers the longest folder and treats an empty folder as the vault root", () => {
    expect(spaceOf("Work/Deep/a.md", spaces)).toBe("Deep");
    expect(spaceOf("Work/a.md", spaces)).toBe("Work");
    expect(spaceOf("Workshop/a.md", spaces)).toBe("Root");
    expect(spaceOf("a.md", [{ name: "Work", folder: "Work" }])).toBeNull();
  });
});
