import { describe, expect, it } from "vitest";
import { buildIndex, parseAddresses, parsePorts, resourceFromFrontmatter, type FileRecord } from "../../src/index/core";
import { parseCredsBlock } from "../../src/creds/parse";
import { parseNetworkBlock } from "../../src/network/parse";
import { parseLedgerBlock } from "../../src/ledger/parse";

function file(path: string, fm: Record<string, unknown> | null, ...blocks: string[]): FileRecord {
  const basename = path.split("/").pop()!.replace(/\.md$/, "");
  return { path, basename, frontmatter: fm, blocks: blocks.map(parseCredsBlock) };
}

describe("resourceFromFrontmatter", () => {
  it("builds a resource from a typed note", () => {
    const r = resourceFromFrontmatter("Infra/Home.md", "Home", {
      type: "server", ip: "10.0.0.4", provider: "proxmox", env: "home", ssh_port: 2222, tags: ["homelab", "pve"],
    });
    expect(r).toEqual({
      path: "Infra/Home.md", name: "Home", type: "server", provider: "proxmox", env: "home", sshPort: 2222,
      tags: ["homelab", "pve"], ports: [], space: null, warnings: [], links: {},
      addresses: [{ value: "10.0.0.4", isHost: false, scope: "private", source: "properties", extra: {} }],
    });
  });
  it("maps unknown types to other and returns null without a type", () => {
    expect(resourceFromFrontmatter("a.md", "a", { type: "router" })?.type).toBe("other");
    expect(resourceFromFrontmatter("a.md", "a", { ip: "1.2.3.4" })).toBeNull();
    expect(resourceFromFrontmatter("a.md", "a", null)).toBeNull();
  });
  it("normalizes ports and tags", () => {
    const r = resourceFromFrontmatter("a.md", "a", { type: "server", ssh_port: "abc", tags: "single" })!;
    expect(r.sshPort).toBe(22);
    expect(r.tags).toEqual(["single"]);
    expect(resourceFromFrontmatter("a.md", "a", { type: "server", ssh_port: "2200" })!.sshPort).toBe(2200);
    expect(resourceFromFrontmatter("a.md", "a", { type: "server", tags: ["#x", 5] })!.tags).toEqual(["x", "5"]);
  });
});

describe("parseAddresses", () => {
  it("accepts a single value, a list and labels", () => {
    const base = { source: "properties", extra: {} };
    expect(parseAddresses("10.0.0.4", false)).toEqual([{ ...base, value: "10.0.0.4", isHost: false, scope: "private" }]);
    expect(parseAddresses(["85.10.20.30/26 public", "10.0.0.4   private net", "", null], false)).toEqual([
      { ...base, value: "85.10.20.30", isHost: false, scope: "public", cidr: "26", label: "public" },
      { ...base, value: "10.0.0.4", isHost: false, scope: "private", label: "private net" },
    ]);
    expect(parseAddresses("box.local", true)).toEqual([{ ...base, value: "box.local", isHost: true, scope: "public" }]);
    expect(parseAddresses(undefined, false)).toEqual([]);
    expect(parseAddresses("  ", false)).toEqual([]);
  });
});

describe("parsePorts", () => {
  it("parses numbers, labelled strings and reports invalid rows", () => {
    const base = { proto: "tcp", source: "properties", extra: {} };
    expect(parsePorts(443)).toEqual({ ports: [{ ...base, port: 443 }], invalid: [] });
    expect(parsePorts(["443 https", "5432 postgres", 8006, "abc web", "70000", ""])).toEqual({
      ports: [{ ...base, port: 443, service: "https" }, { ...base, port: 5432, service: "postgres" }, { ...base, port: 8006 }],
      invalid: ["abc web", "70000"],
    });
  });
});

describe("spaces", () => {
  const spaces = [
    { name: "Personal", folder: "Personal" },
    { name: "Work", folder: "Work" },
    { name: "Work prod", folder: "Work/Prod" },
  ];
  it("assigns the longest matching folder and leaves others without a space", () => {
    const s = buildIndex(
      [
        file("Work/Prod/DB.md", { type: "database" }, "- id: a\n  label: a\n"),
        file("Work/Box.md", { type: "server" }),
        file("Personal/Home.md", { type: "server" }),
        file("Workshop/Note.md", null, "- id: b\n  label: b\n"),
      ],
      spaces,
    );
    const byName = Object.fromEntries(s.resources.map((r) => [r.name, r.space]));
    expect(byName).toEqual({ DB: "Work prod", Box: "Work", Home: "Personal" });
    expect(s.credentials.map((c) => [c.cred.id, c.space])).toEqual([["a", "Work prod"], ["b", null]]);
  });
});

describe("devices and directory notes", () => {
  it("reads hardware fields, links and the ledger status", () => {
    const ledger = parseLedgerBlock("- date: 2026-10-22\n  event: assigned\n  to: \"[[Ayse Yilmaz]]\"\n");
    const s = buildIndex([
      {
        ...file("Laptop 07.md", {
          type: "device", device_type: "laptop", model: "MacBook Pro 14", serial: "C02XYZ",
          location: "[[Office 2F]]", assigned_to: "[[Ayse Yilmaz]]", warranty_until: "2027-05-01", provider: "[[Apple]]",
        }),
        ledger: [ledger],
      },
      file("People/Ayse Yilmaz.md", { type: "person" }),
      file("Office 2F.md", { type: "location" }),
    ]);
    const d = s.resources.find((r) => r.name === "Laptop 07")!;
    expect(d).toMatchObject({
      type: "device", deviceType: "laptop", model: "MacBook Pro 14", serial: "C02XYZ", warrantyUntil: "2027-05-01",
      provider: "Apple", location: "Office 2F", assignedTo: "Ayse Yilmaz",
      links: { provider: "Apple", location: "Office 2F", assigned_to: "Ayse Yilmaz" },
      status: { kind: "assigned", who: { display: "Ayse Yilmaz", link: "Ayse Yilmaz" }, since: "2026-10-22" },
    });
    expect(s.resources.find((r) => r.name === "Ayse Yilmaz")!.type).toBe("person");
    expect(s.resources.find((r) => r.name === "Office 2F")!.type).toBe("location");
  });

  it("keeps plain text values without links and gives non-devices no status", () => {
    const s = buildIndex([file("Box.md", { type: "server", provider: "hetzner", location: "FSN1" })]);
    expect(s.resources[0]).toMatchObject({ provider: "hetzner", location: "FSN1", links: {} });
    expect(s.resources[0].status).toBeUndefined();
  });

  it("collects ledger issues", () => {
    const s = buildIndex([{ ...file("D.md", { type: "device" }), ledger: [parseLedgerBlock("- event: note\n")] }]);
    expect(s.issues.get("D.md")?.[0].code).toBe("invalid-ledger-entry");
  });
});

describe("buildIndex", () => {
  it("merges properties and network block addresses in SSH order", () => {
    const network = parseNetworkBlock("- ip: 85.10.20.30\n  label: main\n- port: 5432\n  service: postgres\n- port: abc\n");
    const s = buildIndex([
      { ...file("Box.md", { type: "server", ip: "10.0.0.4 lan", host: "box.example.com", ports: ["22 ssh"] }), network: [network] },
    ]);
    const r = s.resources[0];
    expect(r.addresses.map((a) => [a.value, a.source])).toEqual([
      ["10.0.0.4", "properties"],
      ["85.10.20.30", "network"],
      ["box.example.com", "properties"],
    ]);
    expect(r.ports.map((p) => [p.port, p.service, p.source])).toEqual([
      [22, "ssh", "properties"],
      [5432, "postgres", "network"],
    ]);
    expect(s.issues.get("Box.md")?.map((i) => i.code)).toEqual(["invalid-port"]);
  });

  it("reports invalid ports as file issues", () => {
    const s = buildIndex([file("A.md", { type: "server", ports: ["99999 nope"] })]);
    expect(s.resources[0].warnings).toEqual(['Port "99999 nope" is not a number between 1 and 65535.']);
  });

  it("indexes resources, credentials and orphans", () => {
    const s = buildIndex([
      file("Home.md", { type: "server" }, "- id: home-root\n  label: root\n"),
      file("Scratch.md", null, "- id: loose\n  label: x\n"),
      file("Empty.md", { type: "cloud" }),
    ]);
    expect(s.resources.map((r) => r.name).sort()).toEqual(["Empty", "Home"]);
    expect(s.credentials.map((c) => [c.cred.id, c.resource?.name ?? null])).toEqual([
      ["home-root", "Home"],
      ["loose", null],
    ]);
    expect(s.byId.get("home-root")).toHaveLength(1);
  });

  it("marks duplicate ids in every file", () => {
    const s = buildIndex([
      file("A.md", { type: "server" }, "- id: dup\n  label: a\n- id: solo\n  label: s\n"),
      file("B.md", { type: "server" }, "- id: dup\n  label: b\n"),
    ]);
    expect(s.credentials.filter((c) => c.duplicate).map((c) => c.path)).toEqual(["A.md", "B.md"]);
    expect(s.credentials.find((c) => c.cred.id === "solo")!.duplicate).toBe(false);
  });

  it("resolves refs as ok, unresolved or ambiguous", () => {
    const s = buildIndex([
      file("A.md", { type: "server" }, "- id: key\n  label: k\n- id: dup\n  label: d\n"),
      file("B.md", { type: "server" }, "- id: dup\n  label: d2\n"),
      file("C.md", { type: "server" }, "- ref: key\n- ref: missing\n- ref: dup\n"),
    ]);
    expect(s.refs.map((r) => [r.ref.ref, r.status])).toEqual([
      ["key", "ok"],
      ["missing", "unresolved"],
      ["dup", "ambiguous"],
    ]);
    expect(s.refs[0].target?.path).toBe("A.md");
  });

  it("hints at sync copies when every id repeats in exactly one other file", () => {
    const body = "- id: a\n  label: a\n- id: b\n  label: b\n";
    const s = buildIndex([
      file("Home.md", { type: "server" }, body),
      file("Home 2.md", { type: "server" }, body),
      file("Other.md", { type: "server" }, "- id: a2\n  label: x\n- id: zz\n  label: y\n"),
    ]);
    expect(s.syncCopies).toEqual([{ copyPath: "Home 2.md", originalPath: "Home.md" }]);
  });

  it("gives no sync hint for partial overlap", () => {
    const s = buildIndex([
      file("A.md", null, "- id: a\n  label: a\n- id: b\n  label: b\n"),
      file("B.md", null, "- id: a\n  label: a\n- id: c\n  label: c\n"),
    ]);
    expect(s.syncCopies).toEqual([]);
  });

  it("collects block issues per file", () => {
    const s = buildIndex([file("Bad.md", { type: "server" }, "- id: a\n  label: b\n  secret: \"open\n")]);
    expect(s.issues.get("Bad.md")?.[0].code).toBe("yaml");
  });
});
