import { describe, expect, it } from "vitest";
import { blockOrdinalAtLine, findBlockWithId, findCredsBlocks, firstCredsBlockLine } from "../../src/creds/locate";

describe("findCredsBlocks", () => {
  it("finds every creds block with exact offsets", () => {
    const note = "# A\n\n```creds\n- id: a\n  label: b\n```\n\ntext\n\n~~~creds\n- ref: x\n~~~\n";
    const blocks = findCredsBlocks(note);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].content).toBe("- id: a\n  label: b\n");
    expect(note.slice(blocks[0].start, blocks[0].end)).toBe("```creds\n- id: a\n  label: b\n```");
    expect(blocks[1].content).toBe("- ref: x\n");
    expect(note.slice(blocks[1].contentStart, blocks[1].contentEnd)).toBe(blocks[1].content);
  });

  it("ignores other languages and creds fences nested in other code blocks", () => {
    const note = "```yaml\n- id: a\n```\n\n````md\n```creds\n- id: b\n```\n````\n";
    expect(findCredsBlocks(note)).toEqual([]);
  });

  it("accepts trailing spaces and longer closing fences", () => {
    const note = "```creds  \n- id: a\n  label: b\n`````\n";
    expect(findCredsBlocks(note)[0].content).toBe("- id: a\n  label: b\n");
  });

  it("ignores an unterminated fence", () => {
    expect(findCredsBlocks("```creds\n- id: a\n")).toEqual([]);
  });

  it("handles empty blocks and CRLF", () => {
    const note = "```creds\n```\r\n```creds\r\n- id: a\r\n  label: b\r\n```\r\n";
    const blocks = findCredsBlocks(note);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].content).toBe("");
    expect(blocks[1].content).toBe("- id: a\r\n  label: b\r\n");
  });
});

describe("findBlockWithId", () => {
  it("returns the block holding the id", () => {
    const note = "```creds\n- id: a\n  label: b\n```\n```creds\n- id: c\n  label: d\n```\n";
    expect(findBlockWithId(note, "c")?.content).toBe("- id: c\n  label: d\n");
    expect(findBlockWithId(note, "zzz")).toBeNull();
  });

  it("does not match refs", () => {
    expect(findBlockWithId("```creds\n- ref: a\n```\n", "a")).toBeNull();
  });
});

describe("firstCredsBlockLine", () => {
  it("returns the 0-based line of the first creds fence", () => {
    const note = "---\ntype: server\n---\n\n```yaml\na: 1\n```\n\n```creds\n- ref: x\n```\n```creds\n```\n";
    expect(firstCredsBlockLine(note)).toBe(8);
    expect(firstCredsBlockLine("no blocks")).toBeNull();
  });
});

describe("blockOrdinalAtLine", () => {
  it("counts blocks of the same language before a line", () => {
    const note = "```network\n```\n\n```creds\n```\n\n```network\n- ip: 1.1.1.1\n```\n";
    expect(blockOrdinalAtLine(note, "network", 0)).toBe(0);
    expect(blockOrdinalAtLine(note, "network", 6)).toBe(1);
    expect(blockOrdinalAtLine(note, "network", 3)).toBeNull();
  });
});
