import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({ Modal: class {}, Setting: class {}, normalizePath: (p: string) => p, TFile: class {} }));

import { resourceTemplate } from "../../src/ui/new-resource";
import { parseCredsBlock } from "../../src/creds/parse";
import { findBlocks, findCredsBlocks } from "../../src/creds/locate";
import { parse } from "yaml";

describe("resourceTemplate", () => {
  it("produces valid frontmatter and an empty creds block for every type", () => {
    for (const type of ["server", "database", "cloud", "service", "device", "other"] as const) {
      const note = resourceTemplate(type, "HomeServer");
      const fm = parse(note.split("---")[1]);
      expect(fm.type).toBe(type);
      expect(fm.tags).toEqual([]);
      const blocks = findCredsBlocks(note);
      expect(blocks).toHaveLength(1);
      expect(parseCredsBlock(blocks[0].content)).toEqual({ entries: [], issues: [], ok: true });
    }
    for (const type of ["person", "location"] as const) {
      expect(findCredsBlocks(resourceTemplate(type, "X"))).toHaveLength(0);
      expect(findBlocks(resourceTemplate(type, "X"), "related")).toHaveLength(1);
    }
    expect(findBlocks(resourceTemplate("server", "X"), "related")).toHaveLength(0);
    const device = resourceTemplate("device", "Laptop");
    expect(findBlocks(device, "ledger")).toHaveLength(1);
    expect(parse(device.split("---")[1])).toMatchObject({ assigned_to: null, serial: null });
    expect(resourceTemplate("server", "X")).toContain("ssh_port: 22");
    expect(findBlocks(resourceTemplate("server", "X"), "network")).toHaveLength(1);
    expect(findBlocks(resourceTemplate("cloud", "X"), "network")).toHaveLength(0);
  });
});
