import { describe, expect, it } from "vitest";
import { addNetworkEntry, deleteNetworkEntry } from "../../src/network/mutate";
import { parseNetworkBlock } from "../../src/network/parse";
import { findBlocks } from "../../src/creds/locate";

const NOTE = `---
type: server
---

# Box

\`\`\`network
# addresses
- ip: 10.0.0.4
  scope: private
  ethId: 7
- port: 0443
  service: https
\`\`\`

\`\`\`creds
- id: a
  label: b
\`\`\`
`;

function ok(r: ReturnType<typeof addNetworkEntry>): string {
  if (!r.ok) throw new Error(r.reason);
  return r.note;
}

const entries = (note: string) => parseNetworkBlock(findBlocks(note, "network")[0].content).entries;

describe("addNetworkEntry", () => {
  it("appends an address with fields in a fixed order", () => {
    const after = ok(addNetworkEntry(NOTE, { ip: "85.10.20.30/26", scope: "public", label: "main", iface: "eth0", vlan: "4000" }));
    const block = findBlocks(after, "network")[0].content;
    expect(block).toContain("- ip: 85.10.20.30/26\n  scope: public\n  label: main\n  iface: eth0\n  vlan: 4000\n");
    expect(entries(after).map((e) => (e.type === "address" ? e.value : e.port))).toEqual(["10.0.0.4", 443, "85.10.20.30"]);
  });

  it("keeps comments, unknown fields and raw values", () => {
    const after = ok(addNetworkEntry(NOTE, { port: 5432, service: "postgres" }));
    expect(after).toContain("# addresses");
    const first = entries(after)[0];
    expect(first.type === "address" && first.extra).toEqual({ ethId: "7" });
    expect(findBlocks(after, "network")[0].content).toMatch(/port: "?0443"?/);
  });

  it("changes nothing outside the block", () => {
    const after = ok(addNetworkEntry(NOTE, { host: "box.example.com" }));
    const b = findBlocks(NOTE, "network")[0];
    const a = findBlocks(after, "network")[0];
    expect(after.slice(0, a.contentStart)).toBe(NOTE.slice(0, b.contentStart));
    expect(after.slice(a.contentEnd)).toBe(NOTE.slice(b.contentEnd));
  });

  it("creates a block before the first creds block, or at the end", () => {
    const withCreds = "# X\n\n```creds\n- id: a\n  label: b\n```\n";
    const after = ok(addNetworkEntry(withCreds, { ip: "10.0.0.1" }));
    expect(after).toBe("# X\n\n```network\n- ip: 10.0.0.1\n```\n\n```creds\n- id: a\n  label: b\n```\n");
    expect(ok(addNetworkEntry("# X", { port: 22, service: "ssh" }))).toBe("# X\n\n```network\n- port: 22\n  service: ssh\n```\n");
  });

  it("fills an empty block", () => {
    const after = ok(addNetworkEntry("```network\n```\n", { ip: "10.0.0.1" }));
    expect(after).toBe("```network\n- ip: 10.0.0.1\n```\n");
  });

  it("refuses a broken block", () => {
    expect(addNetworkEntry('```network\n- ip: "open\n```\n', { ip: "1.1.1.1" }).ok).toBe(false);
  });
});

describe("deleteNetworkEntry", () => {
  it("deletes when position and value match", () => {
    const after = ok(deleteNetworkEntry(NOTE, { block: 0, index: 1, value: "443" }));
    expect(entries(after).map((e) => e.type)).toEqual(["address"]);
    expect(ok(deleteNetworkEntry(NOTE, { block: 0, index: 0, value: "10.0.0.4" }))).not.toContain("10.0.0.4");
  });

  it("refuses when the entry moved", () => {
    expect(deleteNetworkEntry(NOTE, { block: 0, index: 0, value: "443" }).ok).toBe(false);
    expect(deleteNetworkEntry(NOTE, { block: 3, index: 0, value: "10.0.0.4" }).ok).toBe(false);
  });

  it("leaves an empty block after the last entry", () => {
    const note = "```network\n- ip: 10.0.0.1\n```\n";
    expect(ok(deleteNetworkEntry(note, { block: 0, index: 0, value: "10.0.0.1" }))).toBe("```network\n```\n");
  });
});
