import { describe, expect, it } from "vitest";
import { sshCommand, sshTargets } from "../../src/util/ssh";

describe("sshCommand", () => {
  it("builds a command with and without a user", () => {
    expect(sshCommand("10.0.0.4", 2222, "deploy")).toBe("ssh -p 2222 deploy@10.0.0.4");
    expect(sshCommand("10.0.0.4", 22)).toBe("ssh -p 22 10.0.0.4");
  });
});

describe("sshTargets", () => {
  it("keeps the resource's address order, labels and scopes", () => {
    const a = (value: string, scope: "public" | "private", label?: string) => ({
      value, isHost: false, scope, source: "network" as const, extra: {}, ...(label && { label }),
    });
    const targets = sshTargets(
      { addresses: [a("85.10.20.30", "public", "main"), a("10.0.0.4", "private"), a("box.example.com", "public")], sshPort: 22 },
      "root",
    );
    expect(targets).toEqual([
      { address: "85.10.20.30", label: "main", scope: "public", command: "ssh -p 22 root@85.10.20.30" },
      { address: "10.0.0.4", scope: "private", command: "ssh -p 22 root@10.0.0.4" },
      { address: "box.example.com", scope: "public", command: "ssh -p 22 root@box.example.com" },
    ]);
  });
  it("is empty without addresses", () => {
    expect(sshTargets({ addresses: [], sshPort: 22 }, "root")).toEqual([]);
  });
});
