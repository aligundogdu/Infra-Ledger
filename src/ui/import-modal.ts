import { App, Modal, normalizePath, Setting, TFile } from "obsidian";
import { addCredential } from "../creds/mutate";
import { KINDS, type Kind } from "../model";
import { guessKind, replaceFinding, suggestLabel } from "../scan/apply";
import type { Finding } from "../scan/detect";
import { slugify, suggestId } from "../util/ids";
import { resourceTemplate } from "./new-resource";
import type { ResourceType } from "../index/core";
import type InfraLedgerPlugin from "../main";

const NEW = "__new__";

/** Moves one scan finding into a resource's creds block, optionally replacing it in the source note. */
export class ImportSecretModal extends Modal {
  private target: string;
  private newName = "";
  private newType: ResourceType = "server";
  private label: string;
  private user: string;
  private kind: Kind;
  private id = "";
  private idEdited = false;
  private replace = true;

  constructor(
    app: App,
    private readonly plugin: InfraLedgerPlugin,
    private readonly sourcePath: string,
    private readonly finding: Finding,
    private readonly done: () => void,
  ) {
    super(app);
    const source = plugin.index.snapshot.resources.find((r) => r.path === sourcePath);
    this.target = source ? source.path : NEW;
    this.label = suggestLabel(finding);
    this.user = finding.user && finding.kind !== "token" ? decodeUser(finding.user) : "";
    this.kind = guessKind(finding);
  }

  override onOpen(): void {
    const { contentEl } = this;
    this.titleEl.setText("Import secret");
    const resources = [...this.plugin.index.snapshot.resources]
      .filter((r) => r.type !== "person" && r.type !== "location")
      .sort((a, b) => a.name.localeCompare(b.name));

    let newRows: Setting[] = [];
    let idInput!: import("obsidian").TextComponent;
    const refreshId = () => {
      if (this.idEdited) return;
      this.id = suggestId(this.targetName(), this.label || "credential", this.plugin.index.takenIds());
      idInput?.setValue(this.id);
    };

    new Setting(contentEl).setName("Resource").setDesc("Where the credential goes.").addDropdown((d) => {
      d.addOption(NEW, "New note…");
      for (const r of resources) d.addOption(r.path, r.space ? `${r.name} (${r.space})` : r.name);
      d.setValue(this.target).onChange((v) => {
        this.target = v;
        for (const row of newRows) row.settingEl.toggle(v === NEW);
        refreshId();
      });
    });

    newRows = [
      new Setting(contentEl).setName("New note name").addText((t) =>
        t.setPlaceholder("e.g. Desecure SQL Server").onChange((v) => {
          this.newName = v.trim();
          refreshId();
        }),
      ),
      new Setting(contentEl).setName("Type").addDropdown((d) => {
        for (const t of ["server", "database", "cloud", "service", "device", "other"]) d.addOption(t, t);
        d.setValue(this.newType).onChange((v) => (this.newType = v as ResourceType));
      }),
    ];
    for (const row of newRows) row.settingEl.toggle(this.target === NEW);

    new Setting(contentEl).setName("Label").addText((t) =>
      t.setValue(this.label).onChange((v) => {
        this.label = v.trim();
        refreshId();
      }),
    );
    new Setting(contentEl).setName("User").addText((t) => {
      t.inputEl.addClass("infra-ledger-mono");
      t.setValue(this.user).onChange((v) => (this.user = v.trim()));
    });
    new Setting(contentEl).setName("Kind").addDropdown((d) => {
      for (const k of KINDS) d.addOption(k, k);
      d.setValue(this.kind).onChange((v) => (this.kind = v as Kind));
    });
    new Setting(contentEl).setName("Id").addText((t) => {
      idInput = t;
      t.inputEl.addClass("infra-ledger-mono");
      t.onChange((v) => {
        this.id = v.trim();
        this.idEdited = true;
      });
    });
    refreshId();

    new Setting(contentEl)
      .setName("Replace in source")
      .setDesc("Swap the secret in the original note for a link to the resource. Only the secret text changes.")
      .addToggle((t) => t.setValue(this.replace).onChange((v) => (this.replace = v)));

    new Setting(contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) => b.setButtonText("Import").setCta().onClick(() => void this.save()));
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private targetName(): string {
    if (this.target === NEW) return this.newName || "resource";
    return this.plugin.index.snapshot.resources.find((r) => r.path === this.target)?.name ?? "resource";
  }

  private async save(): Promise<void> {
    if (!this.label) return this.plugin.notify("A label is required, e.g. root or sa.");
    if (!this.id || slugify(this.id) !== this.id) {
      return this.plugin.notify("Use lowercase letters, digits and dashes for the id.");
    }
    if (this.plugin.index.snapshot.byId.has(this.id)) {
      return this.plugin.notify(`Id "${this.id}" is already used. Pick another id.`);
    }

    const file = await this.targetFile();
    if (!file) return;

    if (this.replace) {
      const link = `see [[${this.app.metadataCache.fileToLinktext(file, this.sourcePath)}]]`;
      const replaced = await this.plugin.applyMutation(this.sourcePath, (note) => replaceFinding(note, this.finding, link));
      if (!replaced) return;
    }

    const added = await this.plugin.applyMutation(file.path, (note) =>
      addCredential(note, {
        id: this.id,
        label: this.label,
        kind: this.kind,
        secret: this.finding.value,
        ...(this.user && { user: this.user }),
      }),
    );
    if (!added) return;
    this.plugin.notify(`Imported ${this.label} into ${file.basename}.`);
    this.close();
    this.done();
  }

  private async targetFile(): Promise<TFile | null> {
    if (this.target !== NEW) {
      const f = this.app.vault.getAbstractFileByPath(this.target);
      return f instanceof TFile ? f : null;
    }
    if (!this.newName || /[\\/:*?"<>|#^[\]]/.test(this.newName)) {
      this.plugin.notify("Enter a name for the new note without \\ / : * ? \" < > | # ^ [ ].");
      return null;
    }
    const space = this.plugin.namedSpaces().find((s) => s.name === this.plugin.settings.lastSpace) ?? this.plugin.namedSpaces()[0];
    const folder = space?.folder ?? "";
    const path = normalizePath(folder ? `${folder}/${this.newName}.md` : `${this.newName}.md`);
    if (this.app.vault.getAbstractFileByPath(path)) {
      this.plugin.notify(`"${path}" already exists. Pick it from the list instead.`);
      return null;
    }
    if (folder && !this.app.vault.getAbstractFileByPath(normalizePath(folder))) await this.app.vault.createFolder(normalizePath(folder));
    const file = await this.app.vault.create(path, resourceTemplate(this.newType, this.newName));
    await this.plugin.index.refresh(file);
    return file;
  }
}

/** Connection strings percent-encode the user (mailer%40example.com); show it decoded when that works. */
function decodeUser(user: string): string {
  try {
    return decodeURIComponent(user);
  } catch {
    return user;
  }
}
