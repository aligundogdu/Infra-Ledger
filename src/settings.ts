import { App, PluginSettingTab, Setting } from "obsidian";
import type { GeneratorOptions } from "./util/generator";
import { cleanFolder, DEFAULT_SPACES, type Space } from "./spaces";
import type { KeyRecord } from "./crypto/keys";
import type InfraLedgerPlugin from "./main";

export interface InfraLedgerSettings {
  spaces: Space[];
  lastSpace?: string;
  clipboardClearSec: number;
  revealSec: number;
  warrantyWarnDays: number;
  passwordMaxAgeDays: number;
  scanUnlabeled: boolean;
  /** SHA-256 fingerprints of scan findings the user chose to ignore. */
  ignoredFindings: string[];
  generator: GeneratorOptions;
  /** Wrapped data key; present when encryption is set up. */
  encryption?: KeyRecord;
  autoLockMinutes: number;
}

export const DEFAULT_SETTINGS: InfraLedgerSettings = {
  spaces: DEFAULT_SPACES,
  clipboardClearSec: 30,
  revealSec: 10,
  warrantyWarnDays: 30,
  passwordMaxAgeDays: 180,
  scanUnlabeled: false,
  ignoredFindings: [],
  autoLockMinutes: 15,
  generator: { length: 24, symbols: true, excludeAmbiguous: true },
};

export const SECURITY_STATEMENT =
  "Infra Ledger stores everything in your vault as plain Markdown. If your vault syncs to iCloud, Dropbox or Git, " +
  "your credentials go with it. Optional encryption protects the secret fields with a master password. " +
  "Hostnames, users and notes stay readable so you can search them.";

export class InfraLedgerSettingTab extends PluginSettingTab {
  private encryptionSection(containerEl: HTMLElement): void {
    const enc = this.plugin.encryption;
    const s = this.plugin.settings;
    new Setting(containerEl).setName("Encryption").setHeading();
    const { plain, encrypted } = enc.counts();
    const state = !enc.enabled() ? "Off" : enc.unlocked() ? "On, unlocked" : "On, locked";
    containerEl.createEl("p", {
      cls: `infra-ledger-settings-statement${enc.enabled() ? "" : " mod-warning"}`,
      text: `${state}. ${encrypted} encrypted and ${plain} plain secrets in the vault.` +
        (enc.enabled() ? "" : " Secrets are stored as plain text."),
    });

    if (!enc.enabled()) {
      new Setting(containerEl)
        .setName("Set up encryption")
        .setDesc("Encrypts secret fields with a master password. You get a recovery key to keep somewhere safe.")
        .addButton((b) => b.setButtonText("Set up").setCta().onClick(async () => {
          await enc.setUp();
          this.display();
        }));
      return;
    }

    new Setting(containerEl)
      .setName("Encrypt or decrypt everything")
      .setDesc("Rewrites the secret fields in every note. Only those fields change.")
      .addButton((b) => b.setButtonText("Encrypt all").onClick(async () => {
        await this.plugin.runBulk("encrypt");
        this.display();
      }))
      .addButton((b) => b.setButtonText("Decrypt all").onClick(async () => {
        await this.plugin.runBulk("decrypt");
        this.display();
      }));

    new Setting(containerEl)
      .setName("Lock after (minutes)")
      .setDesc("Forget the key after this long without use. 0 keeps it until Obsidian closes.")
      .addText((t) => numberInput(t, s.autoLockMinutes, 0, 1440, async (n) => {
        s.autoLockMinutes = n;
        await this.plugin.saveSettings();
        enc.guard.touch();
      }));

    new Setting(containerEl)
      .setName("Keys")
      .addButton((b) => b.setButtonText(enc.unlocked() ? "Lock now" : "Unlock").onClick(async () => {
        if (enc.unlocked()) enc.guard.lock();
        else await enc.session();
        this.display();
      }))
      .addButton((b) => b.setButtonText("Change password").onClick(async () => {
        await enc.changePassword();
        this.display();
      }))
      .addButton((b) => b.setButtonText("New recovery key").onClick(async () => {
        await enc.replaceRecoveryKey();
        this.display();
      }));

    new Setting(containerEl)
      .setName("Turn off encryption")
      .setDesc("Only possible after Decrypt all.")
      .addButton((b) => b.setButtonText("Turn off").setWarning().onClick(async () => {
        await enc.turnOff();
        this.display();
      }));
  }

  constructor(app: App, private readonly plugin: InfraLedgerPlugin) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    containerEl.empty();

    containerEl.createEl("p", { text: SECURITY_STATEMENT, cls: "infra-ledger-settings-statement" });
    this.encryptionSection(containerEl);

    new Setting(containerEl)
      .setName("Spaces")
      .setDesc(
        "Name a folder per area, e.g. Personal and Work. New resources go into the space you pick, and search " +
          "takes @work to show one space only. Notes outside these folders are still found.",
      )
      .setHeading();

    s.spaces.forEach((space, i) => {
      new Setting(containerEl)
        .addText((t) =>
          t.setPlaceholder("Name").setValue(space.name).onChange(async (v) => {
            space.name = v.trim();
            await this.plugin.saveSettings();
          }),
        )
        .addText((t) =>
          t.setPlaceholder("Folder, e.g. Work/Infra").setValue(space.folder).onChange(async (v) => {
            space.folder = cleanFolder(v);
            await this.plugin.saveSettings();
          }),
        )
        .addExtraButton((b) =>
          b
            .setIcon("trash-2")
            .setTooltip("Remove space")
            .setDisabled(s.spaces.length === 1)
            .onClick(async () => {
              s.spaces.splice(i, 1);
              await this.plugin.saveSettings();
              this.display();
            }),
        );
    });

    new Setting(containerEl).addButton((b) =>
      b.setButtonText("Add space").onClick(async () => {
        s.spaces.push({ name: "", folder: "" });
        await this.plugin.saveSettings();
        this.display();
      }),
    );

    new Setting(containerEl).setName("Clipboard and display").setHeading();

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

    new Setting(containerEl).setName("Inventory warnings").setHeading();

    new Setting(containerEl)
      .setName("Warranty ending within (days)")
      .setDesc("Devices whose warranty_until is this close or already past show up under Warnings. 0 turns it off.")
      .addText((t) => numberInput(t, s.warrantyWarnDays, 0, 3650, async (n) => {
        s.warrantyWarnDays = n;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Password older than (days)")
      .setDesc("Credentials whose updated date is older than this show up under Warnings. 0 turns it off.")
      .addText((t) => numberInput(t, s.passwordMaxAgeDays, 0, 3650, async (n) => {
        s.passwordMaxAgeDays = n;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl).setName("Secret scan").setHeading();

    new Setting(containerEl)
      .setName("Include values without a label")
      .setDesc("Also report lone random-looking lines in code blocks without a language. Finds more, with more false alarms.")
      .addToggle((t) => t.setValue(s.scanUnlabeled).onChange(async (v) => {
        s.scanUnlabeled = v;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Ignored findings")
      .setDesc(`${s.ignoredFindings.length} hidden. Only a fingerprint of each line is stored, never the value.`)
      .addButton((b) =>
        b.setButtonText("Show all again").setDisabled(s.ignoredFindings.length === 0).onClick(async () => {
          s.ignoredFindings = [];
          await this.plugin.saveSettings();
          this.display();
        }),
      );

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
