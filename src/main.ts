import { Notice, Plugin } from "obsidian";
import { LedgerIndex } from "./index/ledger-index";
import { DEFAULT_SETTINGS, InfraLedgerSettingTab, type InfraLedgerSettings } from "./settings";
import { CredsBlockView } from "./ui/block-view";
import { ClipboardGuard } from "./util/clipboard";
import type { Credential } from "./model";

export default class InfraLedgerPlugin extends Plugin {
  override settings: InfraLedgerSettings = structuredClone(DEFAULT_SETTINGS);
  index!: LedgerIndex;
  private clipboard!: ClipboardGuard;
  private shownSyncHints = new Set<string>();

  override async onload(): Promise<void> {
    await this.loadSettings();
    this.index = new LedgerIndex(this.app);
    this.clipboard = new ClipboardGuard(navigator.clipboard);

    this.addSettingTab(new InfraLedgerSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor("creds", (source, el, ctx) => {
      ctx.addChild(new CredsBlockView(el, this, source, ctx.sourcePath));
    });

    this.app.workspace.onLayoutReady(async () => {
      this.index.watch((ref) => this.registerEvent(ref));
      this.registerEvent(this.index.on("changed", () => this.showSyncHints()));
      await this.index.scanAll();
    });
  }

  override onunload(): void {
    this.index?.dispose();
    this.clipboard?.dispose();
  }

  async loadSettings(): Promise<void> {
    const data = ((await this.loadData()) ?? {}) as Partial<InfraLedgerSettings>;
    this.settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      ...data,
      generator: { ...DEFAULT_SETTINGS.generator, ...(data.generator ?? {}) },
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async copySecret(secret: string): Promise<void> {
    const sec = this.settings.clipboardClearSec;
    await this.clipboard.copy(secret, sec, true);
    new Notice(sec > 0 ? `Password copied. Clipboard clears in ${sec} s.` : "Password copied.");
  }

  async copyUser(user: string): Promise<void> {
    await this.clipboard.copy(user, 0, false);
    new Notice("Username copied.");
  }

  async copyText(text: string, message: string): Promise<void> {
    await this.clipboard.copy(text, 0, false);
    new Notice(message);
  }

  /** Write actions per row; filled in by later features. */
  renderRowActions(_cell: HTMLElement, _cred: Credential, _path: string, _duplicate: boolean): void {}

  private showSyncHints(): void {
    for (const hint of this.index.snapshot.syncCopies) {
      const key = `${hint.copyPath}\0${hint.originalPath}`;
      if (this.shownSyncHints.has(key)) continue;
      this.shownSyncHints.add(key);
      new Notice(`"${hint.copyPath}" looks like a sync copy of "${hint.originalPath}". Keep one, delete the other.`, 10000);
    }
  }
}
