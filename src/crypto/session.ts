import type { Session } from "./keys";

/** Holds the unlocked data key in memory and drops it after a period without use. */
export class KeyGuard {
  session: Session | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly idleMinutes: () => number,
    private readonly onLock: () => void,
  ) {}

  unlock(session: Session): void {
    if (this.session && this.session !== session) this.wipe();
    this.session = session;
    this.touch();
  }

  /** Call on every use of the key to push the auto-lock back. */
  touch(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const minutes = this.idleMinutes();
    if (this.session && minutes > 0) this.timer = setTimeout(() => this.lock(), minutes * 60_000);
  }

  lock(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (!this.session) return;
    this.wipe();
    this.onLock();
  }

  private wipe(): void {
    // Best effort: the CryptoKey itself can't be wiped, but the raw copy can.
    this.session?.raw.fill(0);
    this.session = null;
  }
}
