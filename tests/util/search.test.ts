import { describe, expect, it } from "vitest";
import { buildIndex, type FileRecord } from "../../src/index/core";
import { parseCredsBlock } from "../../src/creds/parse";
import { buildSearchItems, matchItems } from "../../src/util/search";

function file(path: string, fm: Record<string, unknown> | null, ...blocks: string[]): FileRecord {
  return { path, basename: path.replace(/\.md$/, "").split("/").pop()!, frontmatter: fm, blocks: blocks.map(parseCredsBlock) };
}

const snapshot = buildIndex([
  file("Infra/HomeServer.md", { type: "server", ip: "192.168.1.10", env: "home", tags: ["homelab"] },
    "- id: home-root\n  label: root\n  user: root\n  secret: a\n  kind: ssh\n- id: home-pg\n  label: postgres app\n  user: appuser\n  kind: db\n"),
  file("Infra/Prod DB.md", { type: "database", host: "db.example.com", env: "prod" },
    "- id: prod-pg\n  label: postgres admin\n  user: postgres\n  kind: db\n- ref: home-root\n"),
  file("Infra/Cloudflare.md", { type: "cloud", provider: "cloudflare" }),
  file("Scratch.md", null, "- id: loose\n  label: api token\n  kind: api-key\n"),
]);

describe("buildSearchItems", () => {
  it("lists credentials, resolved refs and resources without credentials", () => {
    const items = buildSearchItems(snapshot);
    expect(items.map((i) => i.title)).toEqual([
      "Cloudflare",
      "HomeServer › postgres app (appuser)",
      "HomeServer › root (root)",
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

describe("matchItems", () => {
  const items = buildSearchItems(snapshot);
  const titles = (q: string) => matchItems(q, items).map((i) => i.title);

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
