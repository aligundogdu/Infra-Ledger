import { App, Modal, normalizePath, Setting, TFile } from "obsidian";
import type { ResourceType } from "../index/core";
import type InfraLedgerPlugin from "../main";

const FIELDS: Record<ResourceType, string[]> = {
  server: ["ip", "host", "provider", "env", "ssh_port: 22"],
  database: ["host", "provider", "env"],
  cloud: ["provider", "url"],
  service: ["url", "provider", "env"],
  other: ["host", "url"],
};

const INVALID_NAME = /[\\/:*?"<>|#^[\]]/;

export function resourceTemplate(type: ResourceType, name: string): string {
  const fields = FIELDS[type].map((f) => (f.includes(":") ? f : `${f}:`));
  return ["---", `type: ${type}`, ...fields, "tags: []", "---", "", `# ${name}`, "", "```creds", "```", ""].join("\n");
}

export class NewResourceModal extends Modal {
  private type: ResourceType = "server";
  private name = "";

  constructor(app: App, private readonly plugin: InfraLedgerPlugin) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    this.titleEl.setText("New resource");

    new Setting(contentEl).setName("Type").addDropdown((d) => {
      for (const t of Object.keys(FIELDS)) d.addOption(t, t);
      d.setValue(this.type).onChange((v) => (this.type = v as ResourceType));
    });

    new Setting(contentEl)
      .setName("Name")
      .setDesc(`Created in "${this.plugin.settings.resourceFolder || "/"}".`)
      .addText((t) => {
        t.setPlaceholder("HomeServer");
        t.onChange((v) => (this.name = v.trim()));
        t.inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") void this.create();
        });
        window.setTimeout(() => t.inputEl.focus(), 0);
      });

    new Setting(contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) => b.setButtonText("Create").setCta().onClick(() => void this.create()));
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private async create(): Promise<void> {
    if (!this.name) {
      this.plugin.notify("Enter a name, e.g. HomeServer.");
      return;
    }
    if (INVALID_NAME.test(this.name)) {
      this.plugin.notify('A name can\'t contain \\ / : * ? " < > | # ^ [ ].');
      return;
    }
    const folder = this.plugin.settings.resourceFolder;
    const path = normalizePath(folder ? `${folder}/${this.name}.md` : `${this.name}.md`);
    const vault = this.app.vault;
    if (vault.getAbstractFileByPath(path)) {
      this.plugin.notify(`"${path}" already exists. Pick another name.`);
      return;
    }
    if (folder && !vault.getAbstractFileByPath(normalizePath(folder))) await vault.createFolder(normalizePath(folder));
    const file: TFile = await vault.create(path, resourceTemplate(this.type, this.name));
    this.close();
    await this.app.workspace.getLeaf(false).openFile(file);
  }
}
