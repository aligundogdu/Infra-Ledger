import { describe, expect, it } from "vitest";
import { buildIndex, type FileRecord } from "../../src/index/core";
import { parseCredsBlock } from "../../src/creds/parse";
import { buildSearchItems, matchItems, parseQuery } from "../../src/util/search";

function file(path: string, fm: Record<string, unknown> | null, ...blocks: string[]): FileRecord {
  return { path, basename: path.replace(/\.md$/, "").split("/").pop()!, frontmatter: fm, blocks: blocks.map(parseCredsBlock) };
}

const SPACES = [
  { name: "Personal", folder: "Infra" },
  { name: "Work", folder: "Work" },
];

const snapshot = buildIndex([
  file("Infra/HomeServer.md", { type: "server", ip: ["192.168.1.10 lan", "100.64.0.7 tailscale"], ports: ["8006 proxmox"], env: "home", tags: ["homelab"] },
    "- id: home-root\n  label: root\n  user: root\n  secret: a\n  kind: ssh\n- id: home-pg\n  label: postgres app\n  user: appuser\n  kind: db\n"),
  file("Infra/Prod DB.md", { type: "database", host: "db.example.com", env: "prod" },
    "- id: prod-pg\n  label: postgres admin\n  user: postgres\n  kind: db\n- ref: home-root\n"),
  file("Infra/Cloudflare.md", { type: "cloud", provider: "cloudflare" }),
  file("Scratch.md", null, "- id: loose\n  label: api token\n  kind: api-key\n"),
  file("Work/Mail.md", { type: "service", host: "mail.example.com" }, "- id: mail-admin\n  label: admin\n"),
], SPACES);

describe("buildSearchItems", () => {
  it("lists credentials, resolved refs and resources without credentials", () => {
    const items = buildSearchItems(snapshot);
    expect(items.map((i) => i.title)).toEqual([
      "Cloudflare",
      "HomeServer › postgres app (appuser)",
      "HomeServer › root (root)",
      "Mail › admin",
      "Prod DB › postgres admin (postgres)",
      "Prod DB › root (root)",
      "Scratch › api token",
    ]);
    const viaRef = items.find((i) => i.title === "Prod DB › root (root)")!;
    expect(viaRef.resource?.name).toBe("Prod DB");
    expect(viaRef.credential?.cred.id).toBe("home-root");
    expect(viaRef.subtitle).toContain("via ref");
  });
});

describe("devices and directory notes", () => {
  const s2 = buildIndex([
    file("Assets/Laptop 07.md", { type: "device", device_type: "laptop", model: "MacBook Pro 14", serial: "C02XYZ",
      assigned_to: "[[Ayşe Yılmaz]]", location: "[[Office 2F]]" }),
    file("People/Ayşe Yılmaz.md", { type: "person" }),
    file("Assets/Router.md", { type: "device", device_type: "router", ip: "10.0.0.1" }),
  ]);
  const items = buildSearchItems(s2);
  const titles = (q: string) => matchItems(q, items).map((i) => i.title);

  it("finds devices by model, serial, holder and location", () => {
    expect(titles("macbook")).toEqual(["Laptop 07"]);
    expect(titles("c02xyz")).toEqual(["Laptop 07"]);
    expect(titles("ayse laptop")).toEqual(["Laptop 07"]);
    expect(titles("office")).toEqual(["Laptop 07"]);
  });
  it("describes devices and people", () => {
    expect(items.find((i) => i.title === "Laptop 07")!.subtitle).toBe("device · laptop · with Ayşe Yılmaz");
    expect(items.find((i) => i.title === "Ayşe Yılmaz")!.subtitle).toBe("person");
    expect(items.find((i) => i.title === "Router")!.subtitle).toBe("device · router · 10.0.0.1");
  });
});

describe("parseQuery", () => {
  const names = SPACES.map((s) => s.name);
  it("extracts a space prefix by case-insensitive prefix", () => {
    expect(parseQuery("@work prod pg", names)).toEqual({ tokens: ["prod", "pg"], space: "Work", unknownSpace: null });
    expect(parseQuery("@P root", names)).toEqual({ tokens: ["root"], space: "Personal", unknownSpace: null });
    expect(parseQuery("@lab x", names)).toEqual({ tokens: ["x"], space: null, unknownSpace: "lab" });
    expect(parseQuery("root", names)).toEqual({ tokens: ["root"], space: null, unknownSpace: null });
  });
});

describe("matchItems", () => {
  const items = buildSearchItems(snapshot);
  const names = SPACES.map((s) => s.name);
  const titles = (q: string) => matchItems(q, items, names).map((i) => i.title);

  it("filters by space", () => {
    expect(titles("@work")).toEqual(["Mail › admin"]);
    expect(titles("@personal root")).toEqual(["HomeServer › root (root)", "Prod DB › root (root)"]);
    expect(titles("@nope root")).toEqual([]);
  });
  it("matches every address, port and label", () => {
    expect(titles("tailscale root")).toEqual(["HomeServer › root (root)"]);
    expect(titles("8006 pg")).toEqual(["HomeServer › postgres app (appuser)"]);
    expect(titles("mail.example")).toEqual(["Mail › admin"]);
  });
  it("shows the space in the subtitle", () => {
    expect(items.find((i) => i.title === "Mail › admin")!.subtitle).toBe("Work · service · mail.example.com · other");
    expect(items.find((i) => i.title === "HomeServer › root (root)")!.subtitle).toBe("Personal · server · home · 192.168.1.10 · ssh");
  });

  it("requires every token to match", () => {
    expect(titles("prod pg")).toEqual(["Prod DB › postgres admin (postgres)"]);
    expect(titles("home root")).toEqual(["HomeServer › root (root)", "Prod DB › root (root)"]);
  });
  it("matches ip, tags, kind and provider", () => {
    expect(titles("192.168")).toHaveLength(2);
    expect(titles("homelab db")).toEqual(["HomeServer › postgres app (appuser)"]);
    expect(titles("cloudflare")).toEqual(["Cloudflare"]);
    expect(titles("api-key")).toEqual(["Scratch › api token"]);
  });
  it("ranks title matches first", () => {
    expect(titles("root")[0]).toBe("HomeServer › root (root)");
  });
  it("is case and accent insensitive and returns all for an empty query", () => {
    expect(titles("HOMESERVER ROOT")).toEqual(["HomeServer › root (root)"]);
    expect(titles("scrätch")).toEqual(["Scratch › api token"]);
    expect(titles("  ")).toHaveLength(items.length);
  });
});
