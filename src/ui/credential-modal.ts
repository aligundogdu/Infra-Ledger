import { App, Modal, Setting, TextComponent } from "obsidian";
import { KINDS, type Kind } from "../model";
import { generatePassword } from "../util/generator";
import { slugify, suggestId } from "../util/ids";
import type InfraLedgerPlugin from "../main";

export class AddCredentialModal extends Modal {
  private label = "";
  private user = "";
  private secret = "";
  private kind: Kind = "other";
  private note = "";
  private id = "";
  private idEdited = false;

  constructor(
    app: App,
    private readonly plugin: InfraLedgerPlugin,
    private readonly path: string,
    private readonly resourceName: string,
  ) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    this.titleEl.setText(`Add credential to ${this.resourceName}`);
    const taken = this.plugin.index.takenIds();
    let idInput!: TextComponent;
    let secretInput!: TextComponent;

    const submitOnEnter = (t: TextComponent) =>
      t.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") void this.save();
      });

    new Setting(contentEl).setName("Label").setDesc("Required. e.g. root, deploy, postgres app").addText((t) => {
      t.onChange((v) => {
        this.label = v.trim();
        if (!this.idEdited) {
          this.id = this.label ? suggestId(this.resourceName, this.label, taken) : "";
          idInput.setValue(this.id);
        }
      });
      submitOnEnter(t);
      window.setTimeout(() => t.inputEl.focus(), 0);
    });

    new Setting(contentEl).setName("User").addText((t) => {
      t.inputEl.addClass("infra-ledger-mono");
      t.onChange((v) => (this.user = v.trim()));
      submitOnEnter(t);
    });

    new Setting(contentEl)
      .setName("Password")
      .addText((t) => {
        secretInput = t;
        t.inputEl.type = "password";
        t.inputEl.addClass("infra-ledger-mono");
        t.onChange((v) => (this.secret = v));
        submitOnEnter(t);
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

    new Setting(contentEl).setName("Kind").addDropdown((d) => {
      for (const k of KINDS) d.addOption(k, k);
      d.setValue(this.kind).onChange((v) => (this.kind = v as Kind));
    });

    new Setting(contentEl).setName("Note").addText((t) => {
      t.onChange((v) => (this.note = v.trim()));
      submitOnEnter(t);
    });

    new Setting(contentEl)
      .setName("Id")
      .setDesc("Unique across the vault. Other notes use it in a ref.")
      .addText((t) => {
        idInput = t;
        t.inputEl.addClass("infra-ledger-mono");
        t.onChange((v) => {
          this.id = v.trim();
          this.idEdited = true;
        });
        submitOnEnter(t);
      });

    new Setting(contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) => b.setButtonText("Add credential").setCta().onClick(() => void this.save()));
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private async save(): Promise<void> {
    if (!this.label) {
      this.plugin.notify("A label is required, e.g. root or deploy.");
      return;
    }
    if (!this.id || slugify(this.id) !== this.id) {
      this.plugin.notify("Use lowercase letters, digits and dashes for the id, e.g. homeserver-root.");
      return;
    }
    const existing = this.plugin.index.snapshot.byId.get(this.id);
    if (existing && existing.length > 0) {
      this.plugin.notify(`Id "${this.id}" is already used in ${existing[0].path}. Pick another id.`);
      return;
    }
    const added = await this.plugin.addCredential(this.path, {
      id: this.id,
      label: this.label,
      kind: this.kind,
      ...(this.user && { user: this.user }),
      ...(this.secret && { secret: this.secret }),
      ...(this.note && { note: this.note }),
    });
    if (added) this.close();
  }
}
