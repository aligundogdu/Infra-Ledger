import { buildIndex, type FileRecord } from "../../src/index/core";
import { parseCredsBlock } from "../../src/creds/parse";
import { parseLedgerBlock } from "../../src/ledger/parse";

export function file(path: string, fm: Record<string, unknown> | null, creds: string[] = [], ledger: string[] = []): FileRecord {
  return {
    path,
    basename: path.replace(/\.md$/, "").split("/").pop()!,
    frontmatter: fm,
    blocks: creds.map(parseCredsBlock),
    ledger: ledger.map(parseLedgerBlock),
  };
}

export const SPACES = [
  { name: "Personal", folder: "Home" },
  { name: "Work", folder: "Work" },
];

export const snapshot = buildIndex(
  [
    file("Home/NAS.md", { type: "server", env: "home", ip: "192.168.1.5", provider: "Synology" }, [
      "- id: nas-admin\n  label: admin\n  updated: 2025-01-01\n- id: nas-ro\n  label: readonly\n  secret: ro\n- id: nas-key\n  label: key only\n",
    ]),
    file("Work/Box.md", { type: "server", env: "prod", provider: "[[Hetzner]]", location: "FSN1" }, [
      "- id: box-root\n  label: root\n  updated: 2026-10-01\n- ref: nas-admin\n- ref: missing\n",
    ]),
    file("Work/Laptop 07.md", {
      type: "device", device_type: "laptop", model: "MBP 14", assigned_to: "[[Ayşe Yılmaz]]",
      location: "[[Office 2F]]", warranty_until: "2026-11-05",
    }, [], ["- date: 2026-10-22\n  event: assigned\n  to: \"[[Ayşe Yılmaz]]\"\n"]),
    file("Work/Phone 3.md", { type: "device", device_type: "phone", assigned_to: "[[Ayşe Yılmaz]]", warranty_until: "2026-01-01" }),
    file("Work/Laptop 09.md", { type: "device", device_type: "laptop", assigned_to: "Guest", warranty_until: "2026-12-31" }),
    file("Work/Printer.md", { type: "device", device_type: "printer" }),
    file("Work/Old Router.md", { type: "device", device_type: "router", warranty_until: "2020-01-01" }, [],
      ["- date: 2026-01-01\n  event: retired\n"]),
    file("Work/People/Ayşe Yılmaz.md", { type: "person" }),
    file("Home/Dup.md", { type: "server" }, ["- id: box-root\n  label: copy\n  secret: c\n", "- id: x\n  label: y\n  secret: \"open\n"]),
    file("Home/Broken.md", { type: "server", ports: ["99999 nope"] }, ["- id: z\n  label: z\n  secret: \"open\n"]),
  ],
  SPACES,
);
