import { describe, expect, it } from "vitest";
import { sshCommand } from "../../src/util/ssh";

describe("sshCommand", () => {
  it("builds a command from ip, port and user", () => {
    expect(sshCommand({ ip: "10.0.0.4", sshPort: 2222 }, "deploy")).toBe("ssh -p 2222 deploy@10.0.0.4");
  });
  it("defaults to port 22 and prefers ip over host", () => {
    expect(sshCommand({ ip: "10.0.0.4", host: "box.local" }, "root")).toBe("ssh -p 22 root@10.0.0.4");
    expect(sshCommand({ host: "box.local" }, "root")).toBe("ssh -p 22 root@box.local");
  });
  it("omits the user when missing", () => {
    expect(sshCommand({ ip: "10.0.0.4" })).toBe("ssh -p 22 10.0.0.4");
  });
  it("returns null without an address", () => {
    expect(sshCommand({}, "root")).toBeNull();
  });
});
