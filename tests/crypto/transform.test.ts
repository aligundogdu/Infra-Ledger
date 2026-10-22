import { describe, expect, it } from "vitest";
import { collectSecrets, mapSecrets } from "../../src/crypto/transform";
import { findCredsBlocks } from "../../src/creds/locate";

const NOTE = `---
type: server
---

text before

\`\`\`creds
# root
- id: a
  label: root
  user: root
  secret: "plain-a"   # current
  history:
    - secret: 0123
      until: 2026-01-01
- id: b
  label: enc
  secret: "enc:v1:aaa:bbb"
- ref: shared
\`\`\`

middle

\`\`\`creds
- id: c
  label: none
\`\`\`

\`\`\`network
- ip: 10.0.0.1
  note: "secret: not this"
\`\`\`
`;

describe("collectSecrets", () => {
  it("lists secret and history values in order, raw", () => {
    expect(collectSecrets(NOTE)).toEqual(["plain-a", "0123", "enc:v1:aaa:bbb"]);
  });
});

describe("mapSecrets", () => {
  const upper = (v: string) => (v.startsWith("enc:") ? undefined : `X-${v}`);

  it("rewrites only mapped secret values and keeps the rest", () => {
    const r = mapSecrets(NOTE, upper);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changed).toBe(2);
    expect(collectSecrets(r.note)).toEqual(["X-plain-a", "X-0123", "enc:v1:aaa:bbb"]);
    expect(r.note).toContain('secret: "X-plain-a" # current');
    expect(r.note).toContain("# root");
    expect(r.note).toContain("- ref: shared");
    const b = findCredsBlocks(NOTE);
    const a = findCredsBlocks(r.note);
    expect(r.note.slice(0, a[0].contentStart)).toBe(NOTE.slice(0, b[0].contentStart));
    expect(r.note.slice(a[0].contentEnd)).toBe(NOTE.slice(b[0].contentEnd));
  });

  it("returns the note untouched when nothing maps", () => {
    const r = mapSecrets(NOTE, () => undefined);
    expect(r).toEqual({ ok: true, note: NOTE, changed: 0 });
  });

  it("refuses a note with a broken creds block holding secrets", () => {
    const broken = '```creds\n- id: a\n  label: b\n  secret: "open\n```\n';
    expect(mapSecrets(broken, upper).ok).toBe(false);
  });
});
