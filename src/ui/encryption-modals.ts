import { App, Modal, Setting, TextComponent } from "obsidian";

export const MIN_PASSWORD = 12;

/** Asks for a new master password twice. Resolves null when cancelled. */
export function askNewPassword(app: App, heading: string, intro: string): Promise<string | null> {
  return new Promise((resolve) => new NewPasswordModal(app, heading, intro, resolve).open());
}

class NewPasswordModal extends Modal {
  private first = "";
  private second = "";
  private settled = false;

  constructor(app: App, private readonly heading: string, private readonly intro: string, private readonly resolve: (p: string | null) => void) {
    super(app);
  }

  override onOpen(): void {
    this.titleEl.setText(this.heading);
    this.contentEl.createEl("p", { cls: "infra-ledger-modal-hint", text: this.intro });
    const field = (name: string, set: (v: string) => void, focus = false) =>
      new Setting(this.contentEl).setName(name).addText((t) => {
        t.inputEl.type = "password";
        t.onChange(set);
        t.inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") this.submit();
        });
        if (focus) window.setTimeout(() => t.inputEl.focus(), 0);
      });
    field("Master password", (v) => (this.first = v), true);
    field("Repeat", (v) => (this.second = v));
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) => b.setButtonText("Continue").setCta().onClick(() => this.submit()));
  }

  private submit(): void {
    if (this.first.length < MIN_PASSWORD) return void new NoticeLine(this.contentEl, `Use at least ${MIN_PASSWORD} characters.`);
    if (this.first !== this.second) return void new NoticeLine(this.contentEl, "The two passwords don't match.");
    this.settled = true;
    this.resolve(this.first);
    this.close();
  }

  override onClose(): void {
    this.contentEl.empty();
    if (!this.settled) this.resolve(null);
  }
}

/** Shows a recovery key once and waits until the user confirms they saved it. */
export function showRecoveryKey(app: App, key: string, onCopy: (key: string) => void): Promise<void> {
  return new Promise((resolve) => new RecoveryKeyModal(app, key, onCopy, resolve).open());
}

class RecoveryKeyModal extends Modal {
  private saved = false;

  constructor(app: App, private readonly key: string, private readonly onCopy: (k: string) => void, private readonly done: () => void) {
    super(app);
  }

  override onOpen(): void {
    this.titleEl.setText("Recovery key");
    const { contentEl } = this;
    contentEl.createEl("p", {
      text:
        "This key opens your secrets if you forget the master password. It is shown only now and stored nowhere. " +
        "Write it down or keep it in another password manager, away from this vault.",
    });
    contentEl.createEl("pre", { cls: "infra-ledger-recovery-key", text: this.key });
    let done!: import("obsidian").ButtonComponent;
    new Setting(contentEl)
      .addButton((b) => b.setButtonText("Copy").onClick(() => this.onCopy(this.key)))
      .addToggle((t) =>
        t.setTooltip("I saved the recovery key").onChange((v) => {
          this.saved = v;
          done.setDisabled(!v);
        }),
      )
      .setName("I saved the recovery key");
    new Setting(contentEl).addButton((b) => {
      done = b;
      b.setButtonText("Done").setCta().setDisabled(true).onClick(() => this.close());
    });
  }

  override onClose(): void {
    this.contentEl.empty();
    if (!this.saved) {
      // Don't let the only copy disappear by accident.
      window.setTimeout(() => this.open(), 0);
      return;
    }
    this.done();
  }
}

export interface UnlockAnswer {
  secret: string;
  recovery: boolean;
}

/**
 * Asks for the master password, or the recovery key. `check` returns an error message to show,
 * or null when the secret worked. Resolves false when cancelled.
 */
export function askUnlock(app: App, check: (a: UnlockAnswer) => Promise<string | null>): Promise<boolean> {
  return new Promise((resolve) => new UnlockModal(app, check, resolve).open());
}

class UnlockModal extends Modal {
  private secret = "";
  private recovery = false;
  private settled = false;
  private input!: TextComponent;
  private label!: Setting;

  constructor(app: App, private readonly check: (a: UnlockAnswer) => Promise<string | null>, private readonly resolve: (ok: boolean) => void) {
    super(app);
  }

  override onOpen(): void {
    this.titleEl.setText("Unlock Infra Ledger");
    this.label = new Setting(this.contentEl).setName("Master password").addText((t) => {
      this.input = t;
      t.inputEl.type = "password";
      t.onChange((v) => (this.secret = v));
      t.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") void this.submit();
      });
      window.setTimeout(() => t.inputEl.focus(), 0);
    });
    new Setting(this.contentEl)
      .addExtraButton((b) =>
        b.setIcon("life-buoy").setTooltip("Use recovery key").onClick(() => {
          this.recovery = !this.recovery;
          this.label.setName(this.recovery ? "Recovery key" : "Master password");
          this.input.inputEl.type = this.recovery ? "text" : "password";
          this.input.inputEl.addClass("infra-ledger-mono");
          this.input.setValue("");
          this.secret = "";
          this.input.inputEl.focus();
        }),
      )
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) => b.setButtonText("Unlock").setCta().onClick(() => void this.submit()));
  }

  private async submit(): Promise<void> {
    if (!this.secret) return;
    const error = await this.check({ secret: this.secret, recovery: this.recovery });
    if (error) {
      new NoticeLine(this.contentEl, error);
      this.input.setValue("");
      this.secret = "";
      return;
    }
    this.settled = true;
    this.resolve(true);
    this.close();
  }

  override onClose(): void {
    this.contentEl.empty();
    if (!this.settled) this.resolve(false);
  }
}

/** A one-line message inside a modal, replacing the previous one. */
class NoticeLine {
  constructor(parent: HTMLElement, text: string) {
    parent.querySelector(".infra-ledger-modal-error")?.remove();
    parent.createEl("p", { cls: "infra-ledger-modal-error", text });
  }
}
