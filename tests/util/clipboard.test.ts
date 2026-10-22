import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClipboardGuard, type ClipboardLike } from "../../src/util/clipboard";

class FakeClipboard implements ClipboardLike {
  value = "";
  readable = true;
  async writeText(t: string) { this.value = t; }
  async readText() {
    if (!this.readable) throw new Error("denied");
    return this.value;
  }
}

describe("ClipboardGuard", () => {
  let cb: FakeClipboard;
  let guard: ClipboardGuard;
  beforeEach(() => {
    vi.useFakeTimers();
    cb = new FakeClipboard();
    guard = new ClipboardGuard(cb);
  });

  it("clears a sensitive copy after the delay", async () => {
    await guard.copy("secret", 30, true);
    expect(cb.value).toBe("secret");
    await vi.advanceTimersByTimeAsync(29_000);
    expect(cb.value).toBe("secret");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(cb.value).toBe("");
  });

  it("leaves the clipboard alone if it changed", async () => {
    await guard.copy("secret", 30, true);
    cb.value = "something else";
    await vi.advanceTimersByTimeAsync(30_000);
    expect(cb.value).toBe("something else");
  });

  it("clears unconditionally when the clipboard cannot be read", async () => {
    cb.readable = false;
    await guard.copy("secret", 30, true);
    cb.value = "something else";
    await vi.advanceTimersByTimeAsync(30_000);
    expect(cb.value).toBe("");
  });

  it("does not clear non-sensitive copies or when disabled", async () => {
    await guard.copy("root", 30, false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(cb.value).toBe("root");
    await guard.copy("secret", 0, true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(cb.value).toBe("secret");
  });

  it("restarts the timer on a new copy", async () => {
    await guard.copy("one", 30, true);
    await vi.advanceTimersByTimeAsync(20_000);
    await guard.copy("two", 30, true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(cb.value).toBe("two");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(cb.value).toBe("");
  });

  it("dispose cancels a pending clear", async () => {
    await guard.copy("secret", 30, true);
    guard.dispose();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(cb.value).toBe("secret");
  });
});
