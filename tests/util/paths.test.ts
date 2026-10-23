import { describe, expect, it } from "vitest";
import { PathTracker } from "../../src/util/paths";

describe("PathTracker", () => {
  it("follows renames, including chains", () => {
    const t = new PathTracker();
    t.renamed("Infra/A.md", "Infra/Group/A.md");
    t.renamed("Infra/Group/A.md", "Infra/Other/A2.md");
    expect(t.current("Infra/A.md")).toBe("Infra/Other/A2.md");
    expect(t.current("Infra/Group/A.md")).toBe("Infra/Other/A2.md");
    expect(t.current("Infra/B.md")).toBe("Infra/B.md");
  });
  it("stops at a path that was reused by a new file", () => {
    const t = new PathTracker();
    t.renamed("A.md", "B.md");
    t.created("A.md");
    expect(t.current("A.md")).toBe("A.md");
  });
  it("survives a rename back and forth", () => {
    const t = new PathTracker();
    t.renamed("A.md", "B.md");
    t.renamed("B.md", "A.md");
    expect(t.current("A.md")).toBe("A.md");
    expect(t.current("B.md")).toBe("A.md");
  });
});
