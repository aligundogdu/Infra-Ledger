import { describe, expect, it } from "vitest";
import { parseCredsBlock } from "../../src/creds/parse";
import type { Credential, CredRef } from "../../src/model";

const creds = (text: string) =>
  parseCredsBlock(text).entries.filter((e): e is Credential => e.type === "credential");

describe("parseCredsBlock", () => {
  it("returns credentials and refs in order", () => {
    const r = parseCredsBlock(`
- id: home-root
  label: root
  user: root
  secret: "abc"
  kind: ssh
- ref: forge-key
- id: home-pg
  label: postgres app
`);
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.entries.map((e) => e.type)).toEqual(["credential", "ref", "credential"]);
    expect(r.entries.map((e) => e.index)).toEqual([0, 1, 2]);
    const [root] = creds(`- id: a\n  label: b\n  user: root\n  secret: "abc"\n  kind: ssh`);
    expect(root).toMatchObject({ id: "a", label: "b", user: "root", secret: "abc", kind: "ssh", history: [] });
    expect((r.entries[1] as CredRef).ref).toBe("forge-key");
  });

  it("accepts empty and comment-only blocks", () => {
    for (const text of ["", "\n\n", "# nothing here yet\n"]) {
      const r = parseCredsBlock(text);
      expect(r).toEqual({ entries: [], issues: [], ok: true });
    }
  });

  it("reports broken yaml with a line number", () => {
    const r = parseCredsBlock(`- id: a\n  label: b\n  secret: "unterminated\n`);
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toMatchObject({ level: "error", code: "yaml" });
    expect(r.issues[0].line).toBeGreaterThan(0);
  });

  it("rejects a top-level map", () => {
    const r = parseCredsBlock(`id: a\nlabel: b\n`);
    expect(r.ok).toBe(false);
    expect(r.issues[0].code).toBe("not-a-list");
  });

  it("reads plain scalars exactly as written", () => {
    const values = ["0xdeadbeef", "0123456", "1e10", "null", "~", "true", "12345678", "2026-10-22", "-.inf"];
    for (const v of values) {
      const [c] = creds(`- id: a\n  label: b\n  secret: ${v}\n  user: ${v}\n`);
      expect(c.secret, v).toBe(v);
      expect(c.user, v).toBe(v);
    }
    const [c] = creds(`- id: 0012\n  label: 1.50\n  updated: 2026-10-22\n`);
    expect(c.id).toBe("0012");
    expect(c.label).toBe("1.50");
    expect(c.updated).toBe("2026-10-22");
  });

  it("keeps trailing comments out of plain values", () => {
    const [c] = creds(`- id: a   # the id\n  label: b\n  secret: p@ss word  # comment\n`);
    expect(c.id).toBe("a");
    expect(c.secret).toBe("p@ss word");
  });

  it("unescapes quoted values", () => {
    const [c] = creds(`- id: a\n  label: b\n  secret: "a\\"b"\n  user: 'it''s'\n`);
    expect(c.secret).toBe('a"b');
    expect(c.user).toBe("it's");
  });

  it("treats an empty value as missing", () => {
    const [c] = creds(`- id: a\n  label: b\n  secret:\n`);
    expect(c.secret).toBeUndefined();
  });

  it("skips entries without id or label with a warning", () => {
    const r = parseCredsBlock(`- label: no id\n- id: no-label\n- id: ok\n  label: fine\n`);
    expect(r.ok).toBe(true);
    expect(r.entries).toHaveLength(1);
    expect(r.issues.map((i) => i.code)).toEqual(["missing-id", "missing-label"]);
    expect(r.issues.every((i) => i.level === "warning")).toBe(true);
  });

  it("flags maps and lists in core fields and keeps the entry", () => {
    const r = parseCredsBlock(`- id: a\n  label: b\n  secret:\n    nested: 1\n  user: [x, y]\n`);
    expect(r.entries).toHaveLength(1);
    const c = r.entries[0] as Credential;
    expect(c.secret).toBeUndefined();
    expect(c.user).toBeUndefined();
    expect(r.issues.map((i) => i.code)).toEqual(["invalid-field", "invalid-field"]);
  });

  it("flags refs with extra fields", () => {
    const r = parseCredsBlock(`- ref: forge-key\n  label: extra\n`);
    expect(r.entries).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ code: "invalid-ref", level: "warning", index: 0 });
  });

  it("flags entries that are not maps", () => {
    const r = parseCredsBlock(`- just a string\n- id: a\n  label: b\n`);
    expect(r.entries).toHaveLength(1);
    expect(r.issues[0].code).toBe("invalid-entry");
  });

  it("falls back to kind other", () => {
    const [c] = creds(`- id: a\n  label: b\n  kind: ftp\n`);
    expect(c.kind).toBe("other");
    const [d] = creds(`- id: a\n  label: b\n`);
    expect(d.kind).toBe("other");
  });

  it("parses history with raw secrets in order", () => {
    const [c] = creds(`- id: a
  label: b
  secret: "new"
  history:
    - secret: 0123
      until: 2026-03-10
      reason: rotation
    - secret: "older"
      until: 2025-01-01
`);
    expect(c.history).toEqual([
      { secret: "0123", until: "2026-03-10", reason: "rotation" },
      { secret: "older", until: "2025-01-01" },
    ]);
  });

  it("reports a line for entry warnings", () => {
    const r = parseCredsBlock(`- id: a\n  label: b\n- label: missing id\n`);
    expect(r.issues[0]).toMatchObject({ code: "missing-id", line: 3, index: 1 });
  });
});
