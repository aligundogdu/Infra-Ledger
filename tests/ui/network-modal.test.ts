import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({ App: class {}, Modal: class {}, Setting: class {} }));

import { isIpLike } from "../../src/ui/network-modal";

describe("isIpLike", () => {
  it("tells ips from host names", () => {
    expect(isIpLike("10.0.0.4")).toBe(true);
    expect(isIpLike("10.0.0.0/24")).toBe(true);
    expect(isIpLike("2a01:4f8::1")).toBe(true);
    expect(isIpLike("box.example.com")).toBe(false);
    expect(isIpLike("10.0.0")).toBe(false);
  });
});
