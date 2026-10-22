import { describe, expect, it } from "vitest";
import { addEvent, assignTo, readFrontmatterField, returnDevice, setFrontmatterField } from "../../src/ledger/mutate";
import { parseLedgerBlock } from "../../src/ledger/parse";
import { findBlocks } from "../../src/creds/locate";

const NOTE = `---
type: device
model: MacBook Pro 14
assigned_to: "[[Mehmet Kaya]]"
tags:
  - work
---

# Laptop 07

Free text.

\`\`\`ledger
# history
- date: 2026-06-15
  event: assigned
  to: "[[Mehmet Kaya]]"
\`\`\`
`;

function ok(r: { ok: boolean; note?: string; reason?: string }): string {
  if (!r.ok) throw new Error(r.reason);
  return r.note!;
}
const events = (note: string) => parseLedgerBlock(findBlocks(note, "ledger")[0].content).events;
const lines = (s: string) => s.split("\n");

describe("setFrontmatterField", () => {
  it("replaces one line and nothing else", () => {
    const after = setFrontmatterField(NOTE, "assigned_to", "[[Ayşe Yılmaz]]");
    const diff = lines(after).filter((l, i) => l !== lines(NOTE)[i]);
    expect(diff).toEqual(['assigned_to: "[[Ayşe Yılmaz]]"']);
  });
  it("replaces a multi-line value", () => {
    const after = setFrontmatterField(NOTE, "tags", "solo");
    expect(after).toContain('tags: "solo"\n---');
    expect(after).not.toContain("  - work");
  });
  it("replaces an unindented list value", () => {
    const note = "---\ntags:\n- a\n- b\ntype: device\n---\n";
    expect(setFrontmatterField(note, "tags", "x")).toBe('---\ntags: "x"\ntype: device\n---\n');
  });
  it("adds a missing key before the closing fence and empties with null", () => {
    expect(setFrontmatterField(NOTE, "serial", "C02X")).toContain('  - work\nserial: "C02X"\n---');
    expect(setFrontmatterField(NOTE, "assigned_to", null)).toContain("model: MacBook Pro 14\nassigned_to:\ntags:");
  });
  it("creates frontmatter when the note has none", () => {
    expect(setFrontmatterField("# X\n", "assigned_to", "A")).toBe('---\nassigned_to: "A"\n---\n# X\n');
  });
  it("reads a field", () => {
    expect(readFrontmatterField(NOTE, "assigned_to")).toBe("[[Mehmet Kaya]]");
    expect(readFrontmatterField(NOTE, "serial")).toBeNull();
    expect(readFrontmatterField("# X", "a")).toBeNull();
  });
});

describe("assignTo", () => {
  it("logs the return of the previous holder and the new assignment", () => {
    const after = ok(assignTo(NOTE, "[[Ayşe Yılmaz]]", "2026-10-22", "new hire"));
    expect(readFrontmatterField(after, "assigned_to")).toBe("[[Ayşe Yılmaz]]");
    expect(events(after).map((e) => [e.event, e.to?.display ?? e.from?.display, e.date, e.note])).toEqual([
      ["assigned", "Ayşe Yılmaz", "2026-10-22", "new hire"],
      ["returned", "Mehmet Kaya", "2026-10-22", undefined],
      ["assigned", "Mehmet Kaya", "2026-06-15", undefined],
    ]);
    expect(after).toContain("# history");
    expect(after).toContain("# Laptop 07\n\nFree text.\n");
  });
  it("refuses to assign to the current holder", () => {
    expect(assignTo(NOTE, "[[Mehmet Kaya]]", "2026-10-22").ok).toBe(false);
  });
  it("creates a ledger block at the end when there is none", () => {
    const note = "---\ntype: device\n---\n\n# X\n";
    const after = ok(assignTo(note, "Ali", "2026-10-22"));
    expect(after).toBe('---\ntype: device\nassigned_to: "Ali"\n---\n\n# X\n\n```ledger\n- date: 2026-10-22\n  event: assigned\n  to: Ali\n```\n');
  });
});

describe("returnDevice", () => {
  it("empties the holder and logs a return", () => {
    const after = ok(returnDevice(NOTE, "2026-10-22", "left the company"));
    expect(readFrontmatterField(after, "assigned_to")).toBeNull();
    expect(events(after)[0]).toMatchObject({ event: "returned", from: { display: "Mehmet Kaya" }, note: "left the company" });
  });
  it("refuses when nobody holds the device", () => {
    expect(returnDevice("---\ntype: device\n---\n", "2026-10-22").ok).toBe(false);
  });
});

describe("addEvent", () => {
  it("puts the event on top and leaves the rest untouched", () => {
    const after = ok(addEvent(NOTE, { date: "2026-09-01", event: "service", note: "battery" }));
    expect(events(after).map((e) => e.event)).toEqual(["service", "assigned"]);
    expect(after.slice(0, after.indexOf("```ledger"))).toBe(NOTE.slice(0, NOTE.indexOf("```ledger")));
  });
  it("refuses a broken block", () => {
    expect(addEvent('```ledger\n- date: "x\n```\n', { date: "2026-01-01", event: "note" }).ok).toBe(false);
  });
});
