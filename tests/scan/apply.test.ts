import { describe, expect, it } from "vitest";
import { fingerprint, guessKind, replaceFinding, suggestLabel } from "../../src/scan/apply";
import { detectSecrets } from "../../src/scan/detect";

const NOTE = "# Box\n\nDATABASE_URL=postgresql://app:Xy9zQ@10.0.0.4/app\npassword: 'top secret'\nend\n";

describe("replaceFinding", () => {
  it("replaces only the secret text", () => {
    const [dsn, labeled] = detectSecrets(NOTE, { unlabeled: false });
    const r1 = replaceFinding(NOTE, dsn, "see [[Box]]");
    expect(r1.ok && r1.note).toBe("# Box\n\nDATABASE_URL=postgresql://app:see [[Box]]@10.0.0.4/app\npassword: 'top secret'\nend\n");
    const r2 = replaceFinding(NOTE, labeled, "see [[Box]]");
    expect(r2.ok && r2.note).toBe("# Box\n\nDATABASE_URL=postgresql://app:Xy9zQ@10.0.0.4/app\npassword: 'see [[Box]]'\nend\n");
  });
  it("refuses when the note changed under the finding", () => {
    const [dsn] = detectSecrets(NOTE, { unlabeled: false });
    expect(replaceFinding("x" + NOTE, dsn, "see").ok).toBe(false);
  });
});

describe("guessKind and suggestLabel", () => {
  const f = (text: string) => detectSecrets(text, { unlabeled: false })[0];
  it("maps findings to credential kinds", () => {
    expect(guessKind(f("mysql://u:pw123@db"))).toBe("db");
    expect(guessKind(f("CREATE USER a WITH PASSWORD = 'x12345';"))).toBe("db");
    expect(guessKind(f("AKIAABCDEFGHIJKLMNOP"))).toBe("api-key");
    expect(guessKind(f("root ssh password: Ab12cd34"))).toBe("ssh");
    expect(guessKind(f("panel password: Ab12cd34"))).toBe("panel");
    expect(guessKind(f("password: Ab12cd34"))).toBe("other");
  });
  it("prefers the user name, then a cleaned label", () => {
    expect(suggestLabel(f("mysql://app:pw123@db"))).toBe("app");
    expect(suggestLabel(f("Administrator Password\nAb12cd34x"))).toBe("Administrator");
    expect(suggestLabel(f("password: Ab12cd34"))).toBe("password");
  });
});

describe("fingerprint", () => {
  it("is a stable hex digest of path and line without the value in clear", async () => {
    const a = await fingerprint("A.md", "password: x");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await fingerprint("A.md", "password: x")).toBe(a);
    expect(await fingerprint("B.md", "password: x")).not.toBe(a);
  });
});
