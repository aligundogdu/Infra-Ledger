import { describe, expect, it } from "vitest";
import { detectSecrets, maskSecret, type Finding } from "../../src/scan/detect";

const find = (text: string, opts = { unlabeled: false }) => detectSecrets(text, opts);
const values = (text: string, opts = { unlabeled: false }) => find(text, opts).map((f) => f.value);
const one = (text: string): Finding => {
  const all = find(text);
  expect(all).toHaveLength(1);
  return all[0];
};

describe("labeled values", () => {
  it("reads label: value on one line", () => {
    expect(values("password: Hunter2!x")).toEqual(["Hunter2!x"]);
    expect(values("- Şifre = 'abc 123'")).toEqual(["abc 123"]);
    expect(values("DB Pass: `s3cr3t`")).toEqual(["s3cr3t"]);
    expect(values("parola:Gizli.2026")).toEqual(["Gizli.2026"]);
    expect(one("api key: tok_abcdef").kind).toBe("labeled");
  });

  it("skips prose, placeholders and links", () => {
    expect(values("password: see [[HomeServer]]")).toEqual([]);
    expect(values("password: xxx")).toEqual([]);
    expect(values("password: ****")).toEqual([]);
    expect(values("password: <your password>")).toEqual([]);
    expect(values("sudo password bir türlü kabul edilmedi")).toEqual([]);
    expect(values("Forgot password? Reset it from the panel.")).toEqual([]);
  });

  it("reads a value on the line after a bare label", () => {
    const f = find("Administrator Password\n\nDscr!2026x\n");
    expect(f.map((x) => [x.value, x.line, x.label])).toEqual([["Dscr!2026x", 2, "Administrator Password"]]);
    expect(values("Administrator Password:\nWelcome to the server")).toEqual([]);
  });

  it("reads label and value separated by a space with medium confidence", () => {
    const f = one("Sa password Sapass!99");
    expect([f.value, f.confidence]).toEqual(["Sapass!99", "medium"]);
    expect(values("root password changed")).toEqual([]);
  });
});

describe("connection strings", () => {
  it("extracts user, password and host", () => {
    const f = one("MAILER_DSN=smtp://mailer%40example.com:p4ss.word@smtp.example.com:587");
    expect(f).toMatchObject({ kind: "dsn", value: "p4ss.word", user: "mailer%40example.com", host: "smtp.example.com", confidence: "high" });
    expect(one("DATABASE_URL=\"postgresql://app:Xy9zQ@10.0.0.4:5432/app\"")).toMatchObject({ user: "app", value: "Xy9zQ", host: "10.0.0.4" });
    expect(one("redis://:onlypass@cache:6379")).toMatchObject({ value: "onlypass", host: "cache" });
    expect(values("https://example.com/path")).toEqual([]);
  });
});

describe("sql", () => {
  it("finds passwords in user statements", () => {
    expect(one("CREATE USER seouser_x WITH ENCRYPTED PASSWORD 'pw-one';")).toMatchObject({ kind: "sql", value: "pw-one", user: "seouser_x" });
    expect(one("ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'pw-two';")).toMatchObject({ value: "pw-two", user: "root" });
    expect(one("CREATE LOGIN report_ro WITH PASSWORD = 'pw-three', CHECK_POLICY = ON;")).toMatchObject({ value: "pw-three", user: "report_ro" });
  });
});

describe("known tokens", () => {
  it("finds AWS keys with the nearby secret", () => {
    const f = find("AMAZON\n\nAKIAABCDEFGHIJKLMNOP\nabcdEFGHijklMNOPqrstUVWXyz0123456789+/ab\n");
    expect(f.map((x) => [x.kind, x.label, x.value.slice(0, 4)])).toEqual([
      ["token", "AWS access key", "AKIA"],
      ["token", "AWS secret key", "abcd"],
    ]);
    expect(f[1].user).toBe("AKIAABCDEFGHIJKLMNOP");
  });
  it("finds GitHub, Stripe, Slack tokens and private keys", () => {
    expect(values("token ghp_" + "a".repeat(36))).toEqual(["ghp_" + "a".repeat(36)]);
    expect(find("sk_live_" + "b".repeat(24))[0].label).toBe("Stripe key");
    expect(find("xoxb-123-456-abc")[0].label).toBe("Slack token");
    const key = "-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\nBBBB\n-----END OPENSSH PRIVATE KEY-----";
    const f = one(`notes\n${key}\nafter`);
    expect([f.label, f.value, f.line]).toEqual(["Private key", key, 1]);
  });
});

describe("env lines", () => {
  it("reads secret-looking keys", () => {
    expect(one("STRIPE_SECRET=whsec_123abc")).toMatchObject({ kind: "env", label: "STRIPE_SECRET", value: "whsec_123abc", confidence: "medium" });
    expect(values("APP_KEY=\"base64:abc=\"")).toEqual(["base64:abc="]);
    expect(values("APP_ENV=production")).toEqual([]);
  });
});

describe("unlabeled candidates", () => {
  const text = "```\nFtUAqbHKrhgL9\n\nPass-2129219\n\nhello\n/usr/local/bin\n```\nFtUAqbHKrhgL9 outside";
  it("only runs when enabled and only inside code blocks", () => {
    expect(values(text)).toEqual([]);
    const f = find(text, { unlabeled: true });
    expect(f.map((x) => [x.value, x.confidence])).toEqual([["FtUAqbHKrhgL9", "low"], ["Pass-2129219", "low"]]);
  });
});

describe("scope and offsets", () => {
  it("ignores managed blocks and frontmatter-like text inside them", () => {
    const note = "```creds\n- id: a\n  label: b\n  secret: \"password: abc12345\"\n```\n```network\n- ip: 1.1.1.1\n  note: password: x12345678\n```\npassword: realone1";
    expect(values(note)).toEqual(["realone1"]);
  });
  it("gives offsets that slice back to the value", () => {
    const note = "intro\nMAILER_DSN=smtp://u:pw@host\npassword: 'quoted value'\n";
    for (const f of find(note)) expect(note.slice(f.start, f.end)).toBe(f.value);
  });
  it("keeps the stronger finding when two overlap", () => {
    const f = find("DB_PASSWORD=mysql://app:pw123@db/app");
    expect(f.map((x) => [x.kind, x.value])).toEqual([["dsn", "pw123"]]);
  });
});

describe("maskSecret", () => {
  it("keeps two characters at each end of longer values", () => {
    expect(maskSecret("FtUAqbHKrhgL")).toBe("Ft••••gL");
    expect(maskSecret("short")).toBe("••••");
  });
});

describe("false positives from real notes", () => {
  it("skips variables, command substitutions and templates", () => {
    expect(values('echo "✅ SSH Password: $SSH_PASS"')).toEqual([]);
    expect(values("PASSWORD=$(openssl rand -base64 32)")).toEqual([]);
    expect(values("DB_PASSWORD=${DB_PASSWORD}")).toEqual([]);
    expect(values("CREATE USER app WITH PASSWORD '${DB_PASS}';")).toEqual([]);
    expect(values("password: {{ vault_password }}")).toEqual([]);
  });
  it("skips paths, headings and commands in env values", () => {
    expect(values("fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;")).toEqual([]);
    expect(values("## Password Generator: ideas")).toEqual([]);
    expect(values("GENERATE_SECURE_SECRET_CMD=openssl rand --hex 16")).toEqual([]);
  });
  it("looks for unlabeled candidates only in fences without a language", () => {
    const text = "```bash\nFtUAqbHKrhgL9\n```\n```text\nXy7_k2LmPq9z\n```\n```\nAb3$kLm9pQ\n```";
    expect(values(text, { unlabeled: true })).toEqual(["Xy7_k2LmPq9z", "Ab3$kLm9pQ"]);
  });
});
