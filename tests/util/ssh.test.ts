import { describe, expect, it } from "vitest";
import { sshCommand, sshTargets } from "../../src/util/ssh";

describe("sshCommand", () => {
  it("builds a command with and without a user", () => {
    expect(sshCommand("10.0.0.4", 2222, "deploy")).toBe("ssh -p 2222 deploy@10.0.0.4");
    expect(sshCommand("10.0.0.4", 22)).toBe("ssh -p 22 10.0.0.4");
  });
});

describe("sshTargets", () => {
  it("lists ips first, then hosts, keeping labels", () => {
    const targets = sshTargets(
      { ips: [{ value: "85.10.20.30", label: "public" }, { value: "10.0.0.4", label: "private" }], hosts: [{ value: "box.example.com" }], sshPort: 22 },
      "root",
    );
    expect(targets).toEqual([
      { address: "85.10.20.30", label: "public", command: "ssh -p 22 root@85.10.20.30" },
      { address: "10.0.0.4", label: "private", command: "ssh -p 22 root@10.0.0.4" },
      { address: "box.example.com", command: "ssh -p 22 root@box.example.com" },
    ]);
  });
  it("is empty without addresses", () => {
    expect(sshTargets({ ips: [], hosts: [], sshPort: 22 }, "root")).toEqual([]);
  });
});
