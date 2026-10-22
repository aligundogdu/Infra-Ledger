import { describe, expect, it } from "vitest";
import { addCredential, changeSecret, deleteCredential, deleteHistoryEntry } from "../../src/creds/mutate";
import { findCredsBlocks } from "../../src/creds/locate";
import { parseCredsBlock } from "../../src/creds/parse";
import type { Credential } from "../../src/model";

const TODAY = "2026-10-22";

const NOTE = `---
type: server
ip: 192.168.1.10
---

# HomeServer

Free text stays put.

\`\`\`creds
# root first
- id: home-root
  label: root
  user: root
  secret: "old-pass"   # current
  kind: ssh
  custom_field: keep me
- id: home-pg
  label: postgres app
  user: appuser
  secret: 0123456
  port: 0123
- ref: forge-key
\`\`\`

More text after.
`;

function credsOf(note: string): Credential[] {
  return findCredsBlocks(note).flatMap((b) =>
    parseCredsBlock(b.content).entries.filter((e): e is Credential => e.type === "credential"),
  );
}

function expectOutsideUnchanged(before: string, after: string, blockIndex = 0) {
  const b = findCredsBlocks(before)[blockIndex];
  const a = findCredsBlocks(after)[blockIndex];
  expect(after.slice(0, a.contentStart)).toBe(before.slice(0, b.contentStart));
  expect(after.slice(a.contentEnd)).toBe(before.slice(b.contentEnd));
}

function ok(r: ReturnType<typeof changeSecret>): string {
  if (!r.ok) throw new Error(r.reason);
  return r.note;
}

describe("changeSecret", () => {
  it("moves the old secret to the top of history", () => {
    const after = ok(changeSecret(NOTE, "home-root", "new-pass", TODAY, "rotation"));
    const root = credsOf(after).find((c) => c.id === "home-root")!;
    expect(root.secret).toBe("new-pass");
    expect(root.updated).toBe(TODAY);
    expect(root.history).toEqual([{ secret: "old-pass", until: TODAY, reason: "rotation" }]);

    const again = ok(changeSecret(after, "home-root", "newer", "2026-11-01"));
    expect(credsOf(again).find((c) => c.id === "home-root")!.history).toEqual([
      { secret: "new-pass", until: "2026-11-01" },
      { secret: "old-pass", until: TODAY, reason: "rotation" },
    ]);
  });

  it("writes the secret double quoted", () => {
    const after = ok(changeSecret(NOTE, "home-root", "0042", TODAY));
    expect(after).toContain('secret: "0042"');
    expect(credsOf(after).find((c) => c.id === "home-root")!.secret).toBe("0042");
  });

  it("leaves every byte outside the block unchanged", () => {
    expectOutsideUnchanged(NOTE, ok(changeSecret(NOTE, "home-root", "x", TODAY)));
  });

  it("keeps comments, unknown fields and raw values of untouched entries", () => {
    const after = ok(changeSecret(NOTE, "home-root", "x", TODAY));
    expect(after).toContain("# root first");
    expect(after).toMatch(/secret: "x" #\s?current/);
    expect(after).toContain("custom_field: keep me");
    const pg = credsOf(after).find((c) => c.id === "home-pg")!;
    expect(pg.secret).toBe("0123456");
    const block = findCredsBlocks(after)[0].content;
    expect(block).toMatch(/port: "?0123"?/);
    expect(block).toContain("- ref: forge-key");
  });

  it("moves a raw unquoted secret to history unchanged", () => {
    const after = ok(changeSecret(NOTE, "home-pg", "new", TODAY));
    const pg = credsOf(after).find((c) => c.id === "home-pg")!;
    expect(pg.history[0].secret).toBe("0123456");
  });

  it("adds no history row when there was no secret", () => {
    const note = "```creds\n- id: a\n  label: b\n```\n";
    const a = credsOf(ok(changeSecret(note, "a", "first", TODAY)))[0];
    expect(a.secret).toBe("first");
    expect(a.history).toEqual([]);
  });

  it("only touches the block holding the id", () => {
    const note = "```creds\n- id: a\n  label: b\n  secret: x\n```\n\nmid\n\n```creds\n- id: c\n  label: d\n  secret: 007\n```\n";
    const after = ok(changeSecret(note, "a", "y", TODAY));
    expect(after.slice(findCredsBlocks(after)[0].end)).toBe(note.slice(findCredsBlocks(note)[0].end));
  });

  it("fails without changing anything when the id is missing, a ref or duplicated", () => {
    expect(changeSecret(NOTE, "nope", "x", TODAY).ok).toBe(false);
    expect(changeSecret(NOTE, "forge-key", "x", TODAY).ok).toBe(false);
    const dup = "```creds\n- id: a\n  label: b\n- id: a\n  label: c\n```\n";
    expect(changeSecret(dup, "a", "x", TODAY).ok).toBe(false);
  });

  it("fails on a block with a yaml error", () => {
    const broken = "```creds\n- id: a\n  label: b\n  secret: \"open\n```\n";
    expect(changeSecret(broken, "a", "x", TODAY).ok).toBe(false);
  });
});

describe("addCredential", () => {
  it("appends to an existing block", () => {
    const after = ok(addCredential(NOTE, { id: "home-deploy", label: "deploy", user: "deploy", secret: "0099", kind: "ssh" }));
    const added = credsOf(after).find((c) => c.id === "home-deploy")!;
    expect(added).toMatchObject({ label: "deploy", user: "deploy", secret: "0099", kind: "ssh", index: 3 });
    expectOutsideUnchanged(NOTE, after);
  });

  it("fills an empty block", () => {
    const note = "intro\n```creds\n```\nend\n";
    const after = ok(addCredential(note, { id: "a", label: "b" }));
    expect(credsOf(after).map((c) => c.id)).toEqual(["a"]);
    expect(after.startsWith("intro\n```creds\n")).toBe(true);
    expect(after.endsWith("```\nend\n")).toBe(true);
  });

  it("creates a block at the end when the note has none", () => {
    const note = "---\ntype: server\n---\n\n# X\n";
    const after = ok(addCredential(note, { id: "a", label: "b", secret: "s" }));
    expect(after.startsWith(note)).toBe(true);
    expect(credsOf(after)[0]).toMatchObject({ id: "a", secret: "s" });
  });

  it("creates a block after a note without a trailing newline", () => {
    const after = ok(addCredential("# X", { id: "a", label: "b" }));
    expect(after.startsWith("# X\n")).toBe(true);
    expect(credsOf(after)).toHaveLength(1);
  });

  it("rejects an id already in the note", () => {
    expect(addCredential(NOTE, { id: "home-root", label: "again" }).ok).toBe(false);
  });

  it("is not blocked by other duplicates in the note", () => {
    const dup = "```creds\n- id: a\n  label: b\n- id: a\n  label: c\n```\n";
    expect(addCredential(dup, { id: "new", label: "n" }).ok).toBe(true);
  });
});

describe("deleteCredential", () => {
  it("removes the entry and its history", () => {
    const changed = ok(changeSecret(NOTE, "home-root", "x", TODAY));
    const after = ok(deleteCredential(changed, "home-root"));
    expect(credsOf(after).map((c) => c.id)).toEqual(["home-pg"]);
    expect(after).not.toContain("old-pass");
    expectOutsideUnchanged(changed, after);
  });

  it("leaves an empty block when the last entry goes", () => {
    const note = "```creds\n- id: a\n  label: b\n```\n";
    const after = ok(deleteCredential(note, "a"));
    expect(findCredsBlocks(after)[0].content).toBe("");
  });
});

describe("deleteHistoryEntry", () => {
  it("removes one row and drops an empty history", () => {
    let note = ok(changeSecret(NOTE, "home-root", "b", TODAY));
    note = ok(changeSecret(note, "home-root", "c", TODAY));
    const once = ok(deleteHistoryEntry(note, "home-root", 0));
    expect(credsOf(once).find((c) => c.id === "home-root")!.history.map((h) => h.secret)).toEqual(["old-pass"]);
    const twice = ok(deleteHistoryEntry(once, "home-root", 0));
    expect(twice).not.toContain("history:");
  });

  it("fails on an out of range index", () => {
    expect(deleteHistoryEntry(NOTE, "home-root", 0).ok).toBe(false);
  });
});

describe("addCredential with a key", () => {
  it("writes auth and key_path after user, with an optional passphrase", () => {
    const after = ok(addCredential("```creds\n```\n", { id: "d", label: "deploy", user: "deploy", auth: "key", keyPath: "~/.ssh/id_ed25519", secret: "pp", kind: "ssh" }));
    expect(after).toBe('```creds\n- id: d\n  label: deploy\n  user: deploy\n  auth: key\n  key_path: ~/.ssh/id_ed25519\n  secret: "pp"\n  kind: ssh\n```\n');
    const bare = ok(addCredential("```creds\n```\n", { id: "e", label: "e", auth: "key", keyPath: "~/k" }));
    expect(credsOf(bare)[0]).toMatchObject({ auth: "key", keyPath: "~/k" });
    expect(bare).not.toContain("secret");
  });
  it("does not write auth for password credentials", () => {
    expect(ok(addCredential("```creds\n```\n", { id: "f", label: "f", auth: "password", secret: "x" }))).not.toContain("auth");
  });
});
