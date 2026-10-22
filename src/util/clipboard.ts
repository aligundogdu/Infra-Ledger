export interface ClipboardLike {
  writeText(text: string): Promise<void>;
  readText?(): Promise<string>;
}

/** Copies text and, for secrets, clears the clipboard after a delay. */
export class ClipboardGuard {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly clipboard: ClipboardLike) {}

  async copy(text: string, clearAfterSec: number, sensitive: boolean): Promise<void> {
    this.cancel();
    await this.clipboard.writeText(text);
    if (!sensitive || clearAfterSec <= 0) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.clearIfUnchanged(text);
    }, clearAfterSec * 1000);
  }

  dispose(): void {
    this.cancel();
  }

  private cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private async clearIfUnchanged(text: string): Promise<void> {
    let current: string | null = null;
    try {
      current = this.clipboard.readText ? await this.clipboard.readText() : null;
    } catch {
      current = null;
    }
    // Unreadable clipboard (mobile): clear anyway, as documented in settings.
    if (current === null || current === text) await this.clipboard.writeText("");
  }
}
