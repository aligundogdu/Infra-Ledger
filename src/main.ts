import { addIcon, moment, Notice, Plugin, setIcon, setTooltip, TFile } from "obsidian";
import {
  addCredential,
  changeSecret,
  deleteCredential,
  deleteHistoryEntry,
  type MutateResult,
  type NewCredential,
} from "./creds/mutate";
import { LedgerIndex } from "./index/ledger-index";
import { DEFAULT_SETTINGS, InfraLedgerSettingTab, type InfraLedgerSettings } from "./settings";
import { CredsBlockView } from "./ui/block-view";
import { ChangePasswordModal } from "./ui/change-modal";
import { ConfirmModal } from "./ui/confirm-modal";
import { AddCredentialModal } from "./ui/credential-modal";
import { CredentialPicker } from "./ui/credential-picker";
import { HistoryModal } from "./ui/history-modal";
import { NewResourceModal } from "./ui/new-resource";
import { SearchModal } from "./ui/search-modal";
import { ClipboardGuard } from "./util/clipboard";
import type { Credential } from "./model";

const RIBBON_ICON_ID = "infra-ledger";
// brand/logo/ribbon-icon.svg scaled from 24 to Obsidian's 100 unit icon box.
const RIBBON_ICON = `<g transform="scale(4.1667)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M4 3v18"/>
  <rect x="8" y="4" width="12" height="4" rx="1"/>
  <rect x="8" y="10" width="12" height="4" rx="1" stroke-opacity="0.6"/>
  <rect x="8" y="16" width="12" height="4" rx="1" stroke-opacity="0.35"/>
</g>`;

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

    addIcon(RIBBON_ICON_ID, RIBBON_ICON);
    this.addRibbonIcon(RIBBON_ICON_ID, "Infra Ledger: Search", () => new SearchModal(this.app, this).open());

    this.addCommand({
      id: "new-resource",
      name: "New resource",
      callback: () => new NewResourceModal(this.app, this).open(),
    });
    this.addCommand({
      id: "search",
      name: "Search",
      callback: () => new SearchModal(this.app, this).open(),
    });
    this.addCommand({
      id: "change-password",
      name: "Change password",
      checkCallback: (checking) => this.withNoteCredential(checking, (cred, path) => this.openChange(cred, path)),
    });
    this.addCommand({
      id: "show-history",
      name: "Show history",
      checkCallback: (checking) =>
        this.withNoteCredential(checking, (cred, path) => new HistoryModal(this.app, this, cred.id, path).open()),
    });

    this.addCommand({
      id: "add-credential",
      name: "Add credential",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) this.openAdd(file.path);
        return true;
      },
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

  notify(message: string): void {
    new Notice(message);
  }

  /** Write actions shown next to the copy buttons of a credential row. */
  renderRowActions(cell: HTMLElement, cred: Credential, path: string, duplicate: boolean): void {
    this.iconButton(cell, "key-round", "Change password", () => {
      if (duplicate) this.notify(`Duplicate id "${cred.id}". Rename one before editing.`);
      else this.openChange(cred, path);
    });
    this.iconButton(cell, "history", "Show history", () => new HistoryModal(this.app, this, cred.id, path).open());
    this.iconButton(cell, "trash-2", "Delete credential", () => {
      if (duplicate) {
        this.notify(`Duplicate id "${cred.id}". Rename one before editing.`);
        return;
      }
      const n = cred.history.length;
      const extra = n === 0 ? "" : ` and its ${n} previous password${n === 1 ? "" : "s"}`;
      new ConfirmModal(this.app, "Delete credential", `Delete ${cred.label}${extra}?`, "Delete", async () => {
        if (await this.applyMutation(path, (note) => deleteCredential(note, cred.id))) {
          this.notify(`Deleted ${cred.label}.`);
        }
      }).open();
    });
  }

  renderBlockFooter(el: HTMLElement, path: string): void {
    const footer = el.createDiv({ cls: "infra-ledger-footer" });
    const add = footer.createEl("button", { cls: "infra-ledger-add" });
    setIcon(add.createSpan(), "plus");
    add.appendText("Add credential");
    add.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.openAdd(path);
    });
  }

  openAdd(path: string): void {
    const name = path.split("/").pop()!.replace(/\.md$/, "");
    new AddCredentialModal(this.app, this, path, name).open();
  }

  async addCredential(path: string, cred: NewCredential): Promise<boolean> {
    const ok = await this.applyMutation(path, (note) => addCredential(note, cred));
    if (ok) this.notify(`Added ${cred.label}.`);
    return ok;
  }

  openChange(cred: Credential, path: string): void {
    const ic = this.index.snapshot.byId.get(cred.id);
    if (ic && ic.length > 1) {
      this.notify(`Duplicate id "${cred.id}". Rename one before editing.`);
      return;
    }
    new ChangePasswordModal(this.app, this, cred, path).open();
  }

  async changeSecret(path: string, id: string, secret: string, reason?: string): Promise<boolean> {
    const ok = await this.applyMutation(path, (note) => changeSecret(note, id, secret, today(), reason));
    if (ok) this.notify("Password changed. Previous value moved to history.");
    return ok;
  }

  async deleteHistoryEntry(path: string, id: string, index: number): Promise<boolean> {
    const ok = await this.applyMutation(path, (note) => deleteHistoryEntry(note, id, index));
    if (ok) this.notify("History entry deleted.");
    return ok;
  }

  /** Runs a pure mutation atomically on a note. On failure the note is left untouched. */
  async applyMutation(path: string, mutate: (note: string) => MutateResult): Promise<boolean> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      this.notify(`Can't save: "${path}" no longer exists.`);
      return false;
    }
    let failure: string | null = null;
    await this.app.vault.process(file, (note) => {
      const result = mutate(note);
      if (!result.ok) {
        failure = result.reason;
        return note;
      }
      return result.note;
    });
    if (failure) {
      this.notify(failure);
      return false;
    }
    await this.index.refresh(file);
    return true;
  }

  private withNoteCredential(checking: boolean, run: (cred: Credential, path: string) => void): boolean {
    const file = this.app.workspace.getActiveFile();
    if (!file) return false;
    const creds = this.index.snapshot.credentials.filter((c) => c.path === file.path).map((c) => c.cred);
    if (creds.length === 0) return false;
    if (!checking) {
      if (creds.length === 1) run(creds[0], file.path);
      else new CredentialPicker(this.app, creds, (c) => run(c, file.path)).open();
    }
    return true;
  }

  private iconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): void {
    const b = parent.createEl("button", { cls: "clickable-icon infra-ledger-button", attr: { "aria-label": label } });
    setIcon(b, icon);
    setTooltip(b, label);
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
  }

  private showSyncHints(): void {
    for (const hint of this.index.snapshot.syncCopies) {
      const key = `${hint.copyPath}\0${hint.originalPath}`;
      if (this.shownSyncHints.has(key)) continue;
      this.shownSyncHints.add(key);
      new Notice(`"${hint.copyPath}" looks like a sync copy of "${hint.originalPath}". Keep one, delete the other.`, 10000);
    }
  }
}

function today(): string {
  return moment().format("YYYY-MM-DD");
}
