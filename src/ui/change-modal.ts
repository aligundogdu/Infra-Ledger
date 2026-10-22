import { App, Modal, Setting, TextComponent } from "obsidian";
import { generatePassword } from "../util/generator";
import type { Credential } from "../model";
import type InfraLedgerPlugin from "../main";

export class ChangePasswordModal extends Modal {
  private secret = "";
  private reason = "";

  constructor(
    app: App,
    private readonly plugin: InfraLedgerPlugin,
    private readonly cred: Credential,
    private readonly path: string,
  ) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    this.titleEl.setText(`Change password: ${this.cred.label}`);
    if (this.cred.secret !== undefined) {
      contentEl.createEl("p", {
        cls: "infra-ledger-modal-hint",
        text: "The current password moves to history with today's date.",
      });
    }

    let secretInput!: TextComponent;
    new Setting(contentEl)
      .setName("New password")
      .addText((t) => {
        secretInput = t;
        t.inputEl.type = "password";
        t.inputEl.addClass("infra-ledger-mono");
        t.onChange((v) => (this.secret = v));
        t.inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") void this.save();
        });
      })
      .addExtraButton((b) =>
        b.setIcon("eye").setTooltip("Show").onClick(() => {
          const hidden = secretInput.inputEl.type === "password";
          secretInput.inputEl.type = hidden ? "text" : "password";
          b.setIcon(hidden ? "eye-off" : "eye").setTooltip(hidden ? "Hide" : "Show");
        }),
      )
      .addExtraButton((b) =>
        b.setIcon("dices").setTooltip("Generate").onClick(() => {
          this.secret = generatePassword(this.plugin.settings.generator);
          secretInput.setValue(this.secret);
          secretInput.inputEl.type = "text";
        }),
      );

    new Setting(contentEl).setName("Reason").addText((t) => {
      t.setPlaceholder("Why? (optional) e.g. rotation, employee left, leaked");
      t.onChange((v) => (this.reason = v.trim()));
      t.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") void this.save();
      });
    });

    new Setting(contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) => b.setButtonText("Change password").setCta().onClick(() => void this.save()));

    window.setTimeout(() => secretInput.inputEl.focus(), 0);
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private async save(): Promise<void> {
    if (this.secret === "") {
      this.plugin.notify("Enter a new password or press Generate.");
      return;
    }
    if (this.secret === this.cred.secret) {
      this.plugin.notify("The new password is the same as the current one.");
      return;
    }
    const saved = await this.plugin.changeSecret(this.path, this.cred.id, this.secret, this.reason || undefined);
    if (saved) this.close();
  }
}
