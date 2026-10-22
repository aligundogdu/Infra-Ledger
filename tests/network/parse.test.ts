import { describe, expect, it } from "vitest";
import { guessScope, parseNetworkBlock } from "../../src/network/parse";
import type { NetAddress, NetPort } from "../../src/network/parse";

const addresses = (t: string) => parseNetworkBlock(t).entries.filter((e): e is NetAddress => e.type === "address");
const ports = (t: string) => parseNetworkBlock(t).entries.filter((e): e is NetPort => e.type === "port");

describe("parseNetworkBlock", () => {
  it("reads addresses with every known field and keeps unknown ones", () => {
    const [a] = addresses(`- ip: 85.10.20.30/26
  scope: public
  label: main
  iface: eth0
  mac: 00:11:22:33:44:55
  gateway: 85.10.20.1
  vlan: 4000
  ethId: 2
  note: primary
`);
    expect(a).toEqual({
      type: "address", value: "85.10.20.30", isHost: false, cidr: "26", scope: "public", scopeGuessed: false,
      label: "main", iface: "eth0", mac: "00:11:22:33:44:55", gateway: "85.10.20.1", vlan: "4000", note: "primary",
      extra: { ethId: "2" }, index: 0,
    });
  });

  it("reads hosts and guesses scope", () => {
    const list = addresses(`- ip: 10.0.0.4
- ip: 172.20.1.1
- ip: 192.168.1.10
- ip: 100.64.0.7
- ip: 8.8.8.8
- ip: fd00::1
- ip: 2a01:4f8::1/64
- host: box.example.com
- ip: 1.2.3.4
  scope: dmz
`);
    expect(list.map((a) => [a.value, a.scope, a.scopeGuessed])).toEqual([
      ["10.0.0.4", "private", true],
      ["172.20.1.1", "private", true],
      ["192.168.1.10", "private", true],
      ["100.64.0.7", "vpn", true],
      ["8.8.8.8", "public", true],
      ["fd00::1", "private", true],
      ["2a01:4f8::1", "public", true],
      ["box.example.com", "public", true],
      ["1.2.3.4", "other", false],
    ]);
    expect(list[6].cidr).toBe("64");
    expect(list[7].isHost).toBe(true);
  });

  it("reads ports with defaults and rejects invalid ones", () => {
    const r = parseNetworkBlock(`- port: 5432
  service: postgres
  note: private only
- port: 53
  proto: UDP
- port: 70000
- port: abc
`);
    expect(r.entries.filter((e) => e.type === "port")).toEqual([
      { type: "port", port: 5432, proto: "tcp", service: "postgres", note: "private only", extra: {}, index: 0 },
      { type: "port", port: 53, proto: "udp", extra: {}, index: 1 },
    ]);
    expect(r.issues.map((i) => [i.code, i.line])).toEqual([["invalid-port", 6], ["invalid-port", 7]]);
  });

  it("flags entries that are neither address nor port", () => {
    const r = parseNetworkBlock(`- iface: eth0\n- just text\n- ip: 1.2.3.4\n`);
    expect(r.ok).toBe(true);
    expect(r.entries).toHaveLength(1);
    expect(r.issues.map((i) => i.code)).toEqual(["invalid-network-entry", "invalid-network-entry"]);
  });

  it("reads raw values and stringifies nested unknown fields", () => {
    const [a] = addresses(`- ip: 10.0.0.4\n  vlan: 0010\n  tags: [a, b]\n`);
    expect(a.vlan).toBe("0010");
    expect(a.extra).toEqual({ tags: "a, b" });
    const [p] = ports(`- port: 0443\n`);
    expect(p.port).toBe(443);
  });

  it("handles empty and broken blocks", () => {
    expect(parseNetworkBlock("")).toEqual({ entries: [], issues: [], ok: true });
    expect(parseNetworkBlock("- ip: \"open\n").ok).toBe(false);
    expect(parseNetworkBlock("ip: 1.2.3.4").issues[0].code).toBe("not-a-list");
  });
});

describe("guessScope", () => {
  it("leaves edge ranges right", () => {
    expect(guessScope("172.15.0.1", false)).toBe("public");
    expect(guessScope("172.32.0.1", false)).toBe("public");
    expect(guessScope("100.128.0.1", false)).toBe("public");
    expect(guessScope("fe80::1", false)).toBe("private");
    expect(guessScope("localhost", true)).toBe("public");
  });
});
