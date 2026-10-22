import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyGuard } from "../../src/crypto/session";
import type { Session } from "../../src/crypto/keys";

const fake = { raw: new Uint8Array(32), key: {} as CryptoKey } satisfies Session;

describe("KeyGuard", () => {
  let minutes = 15;
  let locked = 0;
  let guard: KeyGuard;
  beforeEach(() => {
    vi.useFakeTimers();
    minutes = 15;
    locked = 0;
    guard = new KeyGuard(() => minutes, () => locked++);
  });
  afterEach(() => guard.lock());

  it("locks after the idle time and wipes the key bytes", () => {
    const s = { raw: new Uint8Array([1, 2, 3]), key: {} as CryptoKey };
    guard.unlock(s);
    expect(guard.session).toBe(s);
    vi.advanceTimersByTime(15 * 60_000);
    expect(guard.session).toBeNull();
    expect([...s.raw]).toEqual([0, 0, 0]);
    expect(locked).toBe(1);
  });

  it("restarts the timer on use", () => {
    guard.unlock(fake);
    vi.advanceTimersByTime(10 * 60_000);
    guard.touch();
    vi.advanceTimersByTime(10 * 60_000);
    expect(guard.session).not.toBeNull();
    vi.advanceTimersByTime(5 * 60_000);
    expect(guard.session).toBeNull();
  });

  it("never locks on its own when the setting is 0", () => {
    minutes = 0;
    guard.unlock({ raw: new Uint8Array(1), key: {} as CryptoKey });
    vi.advanceTimersByTime(24 * 60 * 60_000);
    expect(guard.session).not.toBeNull();
  });

  it("locks on demand once", () => {
    guard.unlock({ raw: new Uint8Array(1), key: {} as CryptoKey });
    guard.lock();
    guard.lock();
    expect(locked).toBe(1);
  });
});
