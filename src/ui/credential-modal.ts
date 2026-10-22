import { App, DropdownComponent, Modal, Setting, TextComponent } from "obsidian";
import { KINDS, type Credential, type Kind } from "../model";
import { generatePassword } from "../util/generator";
import { slugify, suggestId } from "../util/ids";
import type InfraLedgerPlugin from "../main";

/** Adds a credential, or edits one when `existing` is given. Editing never touches the secret. */
export class CredentialModal extends Modal {
  private label: string;
  private user: string;
  private secret = "";
  private kind: Kind;
  private note: string;
  private auth: "password" | "key";
  private keyPath: string;
  private id: string;
  private idEdited = false;

  constructor(
    app: App,
    private readonly plugin: InfraLedgerPlugin,
    private readonly path: string,
    private readonly resourceName: string,
    private readonly existing?: Credential,
  ) {
    super(app);
    this.label = existing?.label ?? "";
    this.user = existing?.user ?? "";
    this.kind = existing?.kind ?? "other";
    this.note = existing?.note ?? "";
    this.auth = existing?.auth ?? "password";
    this.keyPath = existing?.keyPath ?? "";
    this.id = existing?.id ?? "";
  }

  override onOpen(): void {
    const { contentEl } = this;
    const editing = !!this.existing;
    this.titleEl.setText(editing ? `Edit ${this.existing!.label}` : `Add credential to ${this.resourceName}`);
    const taken = this.plugin.index.takenIds();
    let idInput!: TextComponent;
    let secretInput!: TextComponent;

    const submitOnEnter = (t: TextComponent) =>
      t.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") void this.save();
      });

    new Setting(contentEl).setName("Label").setDesc("Required. e.g. root, deploy, postgres app").addText((t) => {
      t.setValue(this.label).onChange((v) => {
        this.label = v.trim();
        if (!editing && !this.idEdited) {
          this.id = this.label ? suggestId(this.resourceName, this.label, taken) : "";
          idInput.setValue(this.id);
        }
      });
      submitOnEnter(t);
      window.setTimeout(() => t.inputEl.focus(), 0);
    });

    new Setting(contentEl).setName("User").addText((t) => {
      t.inputEl.addClass("infra-ledger-mono");
      t.setValue(this.user).onChange((v) => (this.user = v.trim()));
      submitOnEnter(t);
    });

    let keyRow!: Setting;
    let secretRow: Setting | undefined;
    let kindDropdown: DropdownComponent | undefined;
    new Setting(contentEl).setName("Sign in with").addDropdown((d) => {
      d.addOption("password", "Password").addOption("key", "SSH key");
      d.setValue(this.auth).onChange((v) => {
        this.auth = v as "password" | "key";
        keyRow.settingEl.toggle(this.auth === "key");
        secretRow?.setName(this.auth === "key" ? "Passphrase" : "Password");
        secretRow?.setDesc(this.auth === "key" ? "Optional. Only if the key has one." : "");
        if (this.auth === "key" && this.kind === "other") {
          this.kind = "ssh";
          kindDropdown?.setValue("ssh");
        }
      });
    });

    keyRow = new Setting(contentEl)
      .setName("Key file")
      .setDesc("Where the private key is on this computer. The key itself is never stored in the note.")
      .addText((t) => {
        t.setPlaceholder("~/.ssh/id_ed25519");
        t.inputEl.addClass("infra-ledger-mono");
        t.setValue(this.keyPath).onChange((v) => (this.keyPath = v.trim()));
        submitOnEnter(t);
      });
    keyRow.settingEl.toggle(this.auth === "key");

    if (editing) {
      contentEl.createEl("p", {
        cls: "infra-ledger-modal-hint",
        text: `To change the ${this.auth === "key" ? "passphrase" : "password"}, use Change password; the old value then moves to history.`,
      });
    } else {
      secretRow = new Setting(contentEl)
        .setName(this.auth === "key" ? "Passphrase" : "Password")
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
    }

    new Setting(contentEl).setName("Kind").addDropdown((d) => {
      kindDropdown = d;
      for (const k of KINDS) d.addOption(k, k);
      d.setValue(this.kind).onChange((v) => (this.kind = v as Kind));
    });

    new Setting(contentEl).setName("Note").addText((t) => {
      t.setValue(this.note).onChange((v) => (this.note = v.trim()));
      submitOnEnter(t);
    });

    new Setting(contentEl)
      .setName("Id")
      .setDesc(editing ? "Refs in other notes point to this id, so it can't change here." : "Unique across the vault. Other notes use it in a ref.")
      .addText((t) => {
        idInput = t;
        t.inputEl.addClass("infra-ledger-mono");
        t.setValue(this.id).setDisabled(editing);
        t.onChange((v) => {
          this.id = v.trim();
          this.idEdited = true;
        });
        submitOnEnter(t);
      });

    new Setting(contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) => b.setButtonText(editing ? "Save" : "Add credential").setCta().onClick(() => void this.save()));
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private async save(): Promise<void> {
    if (!this.label) {
      this.plugin.notify("A label is required, e.g. root or deploy.");
      return;
    }
    if (this.existing) {
      const saved = await this.plugin.updateCredential(this.path, this.existing.id, {
        label: this.label,
        user: this.user,
        kind: this.kind,
        note: this.note,
        auth: this.auth,
        keyPath: this.auth === "key" ? this.keyPath : "",
      });
      if (saved) this.close();
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
      ...(this.auth === "key" && { auth: "key" as const, ...(this.keyPath && { keyPath: this.keyPath }) }),
      ...(this.user && { user: this.user }),
      ...(this.secret && { secret: this.secret }),
      ...(this.note && { note: this.note }),
    });
    if (added) this.close();
  }
}
