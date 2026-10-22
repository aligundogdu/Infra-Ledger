import { addIcon, moment, Notice, Plugin, setIcon, setTooltip, TFile } from "obsidian";
import {
  addCredential,
  changeSecret,
  deleteCredential,
  deleteHistoryEntry,
  updateCredential,
  type CredentialPatch,
  type MutateResult,
  type NewCredential,
} from "./creds/mutate";
import { LedgerIndex } from "./index/ledger-index";
import { blockOrdinalAtLine, findBlocks, firstCredsBlockLine } from "./creds/locate";
import {
  addNetworkEntry,
  deleteNetworkEntry,
  updateNetworkEntry,
  type NetworkEntryRef,
  type NewAddress,
  type NewPort,
} from "./network/mutate";
import { NetworkBlockView } from "./ui/network-view";
import { AddressModal, PortModal } from "./ui/network-modal";
import type { NetAddress, NetPort } from "./network/parse";
import { LedgerBlockView } from "./ui/ledger-view";
import { RelatedBlockView } from "./ui/related-view";
import { AddEventModal, openAssignFlow, openReturnFlow } from "./ui/ledger-modals";
import { addEvent, assignTo, returnDevice, type NewEvent } from "./ledger/mutate";
import { DEFAULT_SETTINGS, InfraLedgerSettingTab, type InfraLedgerSettings } from "./settings";
import { CredsBlockView } from "./ui/block-view";
import { ChangePasswordModal } from "./ui/change-modal";
import { ConfirmModal } from "./ui/confirm-modal";
import { CredentialModal } from "./ui/credential-modal";
import { CredentialPicker } from "./ui/credential-picker";
import { HistoryModal } from "./ui/history-modal";
import { NewResourceModal } from "./ui/new-resource";
import { SearchModal } from "./ui/search-modal";
import { SshPicker } from "./ui/ssh-picker";
import { sshTargets, type SshTarget } from "./util/ssh";
import { INVENTORY_VIEW, InventoryView } from "./ui/inventory-view";
import { SCAN_VIEW, ScanView } from "./ui/scan-view";
import { ClipboardGuard } from "./util/clipboard";
import { migrateSpaces, type Space } from "./spaces";
import { EncryptionController } from "./crypto/controller";
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
  encryption!: EncryptionController;
  private clipboard!: ClipboardGuard;
  private shownSyncHints = new Set<string>();

  override async onload(): Promise<void> {
    await this.loadSettings();
    this.index = new LedgerIndex(this.app, () => this.settings.spaces);
    this.clipboard = new ClipboardGuard(navigator.clipboard);
    this.encryption = new EncryptionController(this);

    this.addCommand({ id: "lock", name: "Lock", callback: () => this.encryption.guard.lock() });
    this.addCommand({
      id: "unlock",
      name: "Unlock",
      checkCallback: (checking) => {
        if (!this.encryption.enabled() || this.encryption.unlocked()) return false;
        if (!checking) void this.encryption.session();
        return true;
      },
    });
    this.addCommand({ id: "encrypt-all", name: "Encrypt all secrets", callback: () => void this.runBulk("encrypt") });
    this.addCommand({ id: "decrypt-all", name: "Decrypt all secrets", callback: () => void this.runBulk("decrypt") });

    this.addSettingTab(new InfraLedgerSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor("creds", (source, el, ctx) => {
      const info = ctx.getSectionInfo(el);
      const first = !info || firstCredsBlockLine(info.text) === info.lineStart;
      ctx.addChild(new CredsBlockView(el, this, source, ctx.sourcePath, first));
    });
    this.registerMarkdownCodeBlockProcessor("network", (source, el, ctx) => {
      const info = ctx.getSectionInfo(el);
      const ordinal = info ? blockOrdinalAtLine(info.text, "network", info.lineStart) : null;
      ctx.addChild(new NetworkBlockView(el, this, source, ctx.sourcePath, ordinal));
    });
    this.registerMarkdownCodeBlockProcessor("ledger", (source, el, ctx) => {
      ctx.addChild(new LedgerBlockView(el, this, source, ctx.sourcePath));
    });
    this.registerMarkdownCodeBlockProcessor("related", (_source, el, ctx) => {
      ctx.addChild(new RelatedBlockView(el, this, ctx.sourcePath));
    });
    this.addCommand({
      id: "add-related-list",
      name: "Add related list",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) void this.addRelatedBlock(file);
        return true;
      },
    });

    addIcon(RIBBON_ICON_ID, RIBBON_ICON);
    this.addRibbonIcon(RIBBON_ICON_ID, "Infra Ledger: Search", () => new SearchModal(this.app, this).open());
    this.registerView(INVENTORY_VIEW, (leaf) => new InventoryView(leaf, this));
    this.addRibbonIcon("layout-list", "Infra Ledger: Inventory", () => void this.openInventory());
    this.addCommand({ id: "open-inventory", name: "Open inventory", callback: () => void this.openInventory() });
    this.registerView(SCAN_VIEW, (leaf) => new ScanView(leaf, this));
    this.addCommand({ id: "scan-secrets", name: "Scan vault for secrets", callback: () => void this.openScan() });

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

    for (const [id, name, open] of [
      ["add-address", "Add address", (path: string) => this.openAddAddress(path)],
      ["add-port", "Add port", (path: string) => this.openAddPort(path)],
      ["assign", "Assign", (path: string) => this.openAssign(path)],
      ["add-event", "Add event", (path: string) => this.openAddEvent(path)],
    ] as const) {
      this.addCommand({
        id,
        name,
        checkCallback: (checking) => {
          const file = this.app.workspace.getActiveFile();
          if (!file || file.extension !== "md") return false;
          if (!checking) open(file.path);
          return true;
        },
      });
    }

    this.addCommand({
      id: "return",
      name: "Return",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const r = file && this.index.snapshot.resources.find((res) => res.path === file.path);
        if (!file || r?.status?.kind !== "assigned") return false;
        if (!checking) this.openReturn(file.path);
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
    this.encryption?.guard.lock();
  }

  async runBulk(kind: "encrypt" | "decrypt"): Promise<void> {
    if (!this.encryption.enabled()) {
      this.notify('Encryption is off. Set it up in Settings → Infra Ledger first.');
      return;
    }
    const report = kind === "encrypt" ? await this.encryption.encryptAll() : await this.encryption.decryptAll();
    if (!report) return;
    const verb = kind === "encrypt" ? "Encrypted" : "Decrypted";
    const parts = [`${verb} ${report.values} values in ${report.notes} notes.`];
    if (report.skipped.length > 0) parts.push(`Skipped ${report.skipped.length} that changed or have a broken block: ${report.skipped.join(", ")}. Run it again.`);
    if (report.failed > 0) parts.push(`${report.failed} values couldn't be decrypted with this key.`);
    new Notice(parts.join(" "), report.skipped.length > 0 || report.failed > 0 ? 15000 : 5000);
  }

  async loadSettings(): Promise<void> {
    const data = ((await this.loadData()) ?? {}) as Partial<InfraLedgerSettings> & { resourceFolder?: string };
    if (data.encryption?.version !== 1) delete data.encryption;
    data.ignoredFindings = Array.isArray(data.ignoredFindings) ? data.ignoredFindings : [];
    const { resourceFolder: _old, ...rest } = data;
    this.settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      ...rest,
      spaces: migrateSpaces(data),
      generator: { ...DEFAULT_SETTINGS.generator, ...(data.generator ?? {}) },
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.index?.reindexSpaces();
    // Warning thresholds live in settings; repaint open inventory panels.
    for (const leaf of this.app.workspace.getLeavesOfType(INVENTORY_VIEW)) {
      if (leaf.view instanceof InventoryView) leaf.view.refresh();
    }
  }

  /** Spaces with a name, in settings order. */
  namedSpaces(): Space[] {
    return this.settings.spaces.filter((s) => s.name !== "");
  }

  async copySecret(secret: string): Promise<void> {
    const plain = await this.encryption.reveal(secret);
    if (plain === null) return;
    const sec = this.settings.clipboardClearSec;
    await this.clipboard.copy(plain, sec, true);
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

  /** "Copy SSH login" for ssh and key credentials, when the note has an address to log in to. */
  renderSshButton(cell: HTMLElement, cred: Credential, path: string): void {
    if (cred.kind !== "ssh" && cred.auth !== "key") return;
    const r = this.index.snapshot.resources.find((res) => res.path === path);
    if (!r || r.addresses.length === 0) return;
    this.iconButton(cell, "terminal", "Copy SSH login", () => this.copySshLogin(cred, path));
  }

  copySshLogin(cred: Credential, path: string): void {
    const r = this.index.snapshot.resources.find((res) => res.path === path);
    const targets = r ? sshTargets(r, cred.user, cred.auth === "key" ? cred.keyPath : undefined) : [];
    if (targets.length === 0) {
      this.notify(`${r?.name ?? "This note"} has no ip or host, so there is no SSH command.`);
      return;
    }
    const copy = (t: SshTarget) => {
      const hint = cred.auth === "key" ? "" : " Use the copy button for the password.";
      void this.copyText(t.command, `SSH command copied: ${t.command}.${hint}`);
    };
    if (targets.length === 1) copy(targets[0]);
    else new SshPicker(this.app, targets, copy).open();
  }

  /** Write actions shown next to the copy buttons of a credential row. */
  renderRowActions(cell: HTMLElement, cred: Credential, path: string, duplicate: boolean): void {
    this.iconButton(cell, "pencil", "Edit", () => {
      if (duplicate) this.notify(`Duplicate id "${cred.id}". Rename one before editing.`);
      else new CredentialModal(this.app, this, path, path.split("/").pop()!.replace(/\.md$/, ""), cred).open();
    });
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
    new CredentialModal(this.app, this, path, name).open();
  }

  async addCredential(path: string, cred: NewCredential): Promise<boolean> {
    if (cred.secret) {
      const sealed = await this.encryption.seal(cred.secret);
      if (sealed === null) return false;
      cred = { ...cred, secret: sealed };
    }
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
    const sealed = await this.encryption.seal(secret);
    if (sealed === null) return false;
    const ok = await this.applyMutation(path, (note) => changeSecret(note, id, sealed, today(), reason));
    if (ok) this.notify("Password changed. Previous value moved to history.");
    return ok;
  }

  async deleteHistoryEntry(path: string, id: string, index: number): Promise<boolean> {
    const ok = await this.applyMutation(path, (note) => deleteHistoryEntry(note, id, index));
    if (ok) this.notify("History entry deleted.");
    return ok;
  }

  async openInventory(): Promise<void> {
    await this.openSideView(INVENTORY_VIEW);
  }

  async openScan(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(SCAN_VIEW)[0];
    await this.openSideView(SCAN_VIEW);
    if (existing?.view instanceof ScanView) await existing.view.scanAll();
  }

  private async openSideView(type: string): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(type)[0];
    if (leaf) {
      // Obsidian 1.7+ restores side tabs lazily; a tab restored before this plugin registered its view
      // keeps the type but holds an empty placeholder. Load it, and rebuild it if our view isn't there.
      await (leaf as { loadIfDeferred?: () => Promise<void> }).loadIfDeferred?.();
      if (!(leaf.view instanceof InventoryView) && !(leaf.view instanceof ScanView)) {
        await leaf.setViewState({ type, active: true });
      }
    } else {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
      await leaf.setViewState({ type, active: true });
    }
    await workspace.revealLeaf(leaf);
  }

  async addRelatedBlock(file: TFile): Promise<void> {
    let added = false;
    await this.app.vault.process(file, (note) => {
      if (findBlocks(note, "related").length > 0) return note;
      added = true;
      const base = note.length === 0 || note.endsWith("\n") ? note : note + "\n";
      return `${base}${base.endsWith("\n\n") || base.length === 0 ? "" : "\n"}\`\`\`related\n\`\`\`\n`;
    });
    this.notify(added ? "Added a related list at the end of the note." : "This note already has a related list.");
  }

  openAssign(path: string): void {
    openAssignFlow(this, path);
  }

  openReturn(path: string): void {
    const r = this.index.snapshot.resources.find((res) => res.path === path);
    if (r?.status?.kind !== "assigned") {
      this.notify("This device isn't assigned to anyone.");
      return;
    }
    openReturnFlow(this, path, r.status.who.display);
  }

  openAddEvent(path: string): void {
    new AddEventModal(this.app, this, path).open();
  }

  async assign(path: string, person: string, display: string, note?: string): Promise<boolean> {
    const ok = await this.applyMutation(path, (text) => assignTo(text, person, today(), note));
    if (ok) this.notify(`Assigned to ${display}.`);
    return ok;
  }

  async returnDevice(path: string, note?: string): Promise<boolean> {
    const ok = await this.applyMutation(path, (text) => returnDevice(text, today(), note));
    if (ok) this.notify("Returned. The device is not assigned now.");
    return ok;
  }

  async addEvent(path: string, event: NewEvent): Promise<boolean> {
    const ok = await this.applyMutation(path, (text) => addEvent(text, event));
    if (ok) this.notify(`Added ${event.event} on ${event.date}.`);
    return ok;
  }

  openAddAddress(path: string): void {
    new AddressModal(this.app, this, path).open();
  }

  openAddPort(path: string): void {
    new PortModal(this.app, this, path).open();
  }

  openEditAddress(path: string, ref: NetworkEntryRef | null, entry: NetAddress): void {
    if (ref) new AddressModal(this.app, this, path, { ref, entry }).open();
  }

  openEditPort(path: string, ref: NetworkEntryRef | null, entry: NetPort): void {
    if (ref) new PortModal(this.app, this, path, { ref, entry }).open();
  }

  async updateNetworkEntry(path: string, ref: NetworkEntryRef, entry: NewAddress | NewPort, name: string): Promise<boolean> {
    const ok = await this.applyMutation(path, (note) => updateNetworkEntry(note, ref, entry));
    if (ok) this.notify(`Saved ${name}.`);
    return ok;
  }

  async updateCredential(path: string, id: string, patch: CredentialPatch): Promise<boolean> {
    const ok = await this.applyMutation(path, (note) => updateCredential(note, id, patch));
    if (ok) this.notify(`Saved ${patch.label ?? id}.`);
    return ok;
  }

  async addNetworkEntry(path: string, entry: NewAddress | NewPort, name: string): Promise<boolean> {
    const ok = await this.applyMutation(path, (note) => addNetworkEntry(note, entry));
    if (ok) this.notify(`Added ${name}.`);
    return ok;
  }

  async deleteNetworkEntry(path: string, ref: NetworkEntryRef, name: string): Promise<boolean> {
    const ok = await this.applyMutation(path, (note) => deleteNetworkEntry(note, ref));
    if (ok) this.notify(`Deleted ${name}.`);
    return ok;
  }

  /** Login for SSH commands built from a note: its first ssh or key credential, else any with a user. */
  sshLoginFor(path: string): { user?: string; keyPath?: string } {
    const creds = this.index.snapshot.credentials.filter((c) => c.path === path).map((c) => c.cred);
    const cred = creds.find((c) => c.kind === "ssh" || c.auth === "key") ?? creds.find((c) => c.user);
    if (!cred) return {};
    return { ...(cred.user && { user: cred.user }), ...(cred.auth === "key" && cred.keyPath && { keyPath: cred.keyPath }) };
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
