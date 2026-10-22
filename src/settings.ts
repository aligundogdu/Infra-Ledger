import { App, PluginSettingTab, Setting } from "obsidian";
import type { GeneratorOptions } from "./util/generator";
import type InfraLedgerPlugin from "./main";

export interface InfraLedgerSettings {
  resourceFolder: string;
  clipboardClearSec: number;
  revealSec: number;
  generator: GeneratorOptions;
}

export const DEFAULT_SETTINGS: InfraLedgerSettings = {
  resourceFolder: "Infra",
  clipboardClearSec: 30,
  revealSec: 10,
  generator: { length: 24, symbols: true, excludeAmbiguous: true },
};

export const SECURITY_STATEMENT =
  "Infra Ledger stores everything in your vault as plain Markdown. If your vault syncs to iCloud, Dropbox or Git, " +
  "your credentials go with it. Optional encryption protects the secret fields with a master password. " +
  "Hostnames, users and notes stay readable so you can search them.";

export class InfraLedgerSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: InfraLedgerPlugin) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    containerEl.empty();

    containerEl.createEl("p", { text: SECURITY_STATEMENT, cls: "infra-ledger-settings-statement" });
    containerEl.createEl("p", {
      text: "Encryption is not available yet. Secrets are stored as plain text.",
      cls: "infra-ledger-settings-statement mod-warning",
    });

    new Setting(containerEl)
      .setName("Resource folder")
      .setDesc("Where new resource notes are created. Resources and creds blocks are found anywhere in the vault.")
      .addText((t) =>
        t.setPlaceholder("Infra").setValue(s.resourceFolder).onChange(async (v) => {
          s.resourceFolder = v.trim().replace(/^\/+|\/+$/g, "");
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Clear clipboard after (seconds)")
      .setDesc(
        "Copied secrets are removed from the clipboard after this many seconds. 0 turns it off. " +
          "Clipboard history apps and Universal Clipboard may keep their own copy. " +
          "On mobile the clipboard can't be read, so it is emptied when the time is up even if you copied something else.",
      )
      .addText((t) => numberInput(t, s.clipboardClearSec, 0, 600, async (n) => {
        s.clipboardClearSec = n;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Hide revealed secrets after (seconds)")
      .setDesc("A secret shown with the eye button is masked again after this many seconds.")
      .addText((t) => numberInput(t, s.revealSec, 1, 600, async (n) => {
        s.revealSec = n;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl).setName("Password generator").setHeading();

    new Setting(containerEl)
      .setName("Length")
      .addText((t) => numberInput(t, s.generator.length, 8, 128, async (n) => {
        s.generator.length = n;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Symbols")
      .setDesc("Quotes, backslash, backtick and spaces are never used.")
      .addToggle((t) => t.setValue(s.generator.symbols).onChange(async (v) => {
        s.generator.symbols = v;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Skip look-alike characters")
      .setDesc("Leaves out 0 O 1 l I |.")
      .addToggle((t) => t.setValue(s.generator.excludeAmbiguous).onChange(async (v) => {
        s.generator.excludeAmbiguous = v;
        await this.plugin.saveSettings();
      }));
  }
}

function numberInput(
  t: import("obsidian").TextComponent,
  value: number,
  min: number,
  max: number,
  save: (n: number) => Promise<void>,
) {
  t.inputEl.type = "number";
  t.inputEl.min = String(min);
  t.inputEl.max = String(max);
  t.setValue(String(value)).onChange(async (v) => {
    const n = Number.parseInt(v, 10);
    if (Number.isInteger(n) && n >= min && n <= max) await save(n);
  });
  return t;
}
