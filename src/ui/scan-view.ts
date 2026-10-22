import { ItemView, setIcon, setTooltip, TFile, type WorkspaceLeaf } from "obsidian";
import { detectSecrets, maskSecret, type Finding } from "../scan/detect";
import { fingerprint } from "../scan/apply";
import { ImportSecretModal } from "./import-modal";
import type InfraLedgerPlugin from "../main";

export const SCAN_VIEW = "infra-ledger-scan";

export interface ScanHit {
  finding: Finding;
  lineText: string;
  hash: string;
}

export class ScanView extends ItemView {
  private results = new Map<string, ScanHit[]>();
  private revealed = new Set<string>();
  private scanning = false;
  private scanned = 0;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: InfraLedgerPlugin) {
    super(leaf);
  }

  override getViewType(): string {
    return SCAN_VIEW;
  }

  override getDisplayText(): string {
    return "Secret scan";
  }

  override getIcon(): string {
    return "scan-search";
  }

  override async onOpen(): Promise<void> {
    await this.scanAll();
  }

  async scanAll(): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    this.results.clear();
    this.revealed.clear();
    this.render();
    const files = this.app.vault.getMarkdownFiles();
    this.scanned = files.length;
    for (const file of files) await this.scanFile(file);
    this.scanning = false;
    this.render();
  }

  /** Re-reads one note after an import, ignore or edit. */
  async rescan(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.scanFile(file);
    else this.results.delete(path);
    this.render();
  }

  private async scanFile(file: TFile): Promise<void> {
    const text = await this.app.vault.cachedRead(file);
    const lines = text.split("\n");
    const ignored = new Set(this.plugin.settings.ignoredFindings);
    const hits: ScanHit[] = [];
    for (const finding of detectSecrets(text, { unlabeled: this.plugin.settings.scanUnlabeled })) {
      const lineText = lines[finding.line] ?? "";
      const hash = await fingerprint(file.path, lineText);
      if (!ignored.has(hash)) hits.push({ finding, lineText, hash });
    }
    if (hits.length > 0) this.results.set(file.path, hits);
    else this.results.delete(file.path);
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("infra-ledger-inventory", "infra-ledger-scan");

    const head = root.createDiv({ cls: "infra-ledger-scan-head" });
    const total = [...this.results.values()].reduce((n, h) => n + h.length, 0);
    head.createSpan({
      text: this.scanning
        ? "Scanning…"
        : total === 0
          ? `No secrets found in ${this.scanned} notes.`
          : `${total} possible secrets in ${this.results.size} of ${this.scanned} notes.`,
    });
    const again = head.createEl("button", { text: "Scan again" });
    again.disabled = this.scanning;
    again.addEventListener("click", () => void this.scanAll());

    root.createEl("p", {
      cls: "infra-ledger-modal-hint",
      text:
        "Values stay masked until you reveal them. Import moves a secret into a resource; Ignore hides it for good. " +
        (this.plugin.settings.scanUnlabeled ? "" : "Lone values without a label are skipped; turn them on in settings."),
    });

    const paths = [...this.results.keys()].sort((a, b) => a.localeCompare(b));
    for (const path of paths) {
      const title = root.createDiv({ cls: "infra-ledger-group-title" });
      const a = title.createEl("a", { cls: "internal-link", text: path, href: path });
      a.addEventListener("click", (e) => {
        e.preventDefault();
        void this.app.workspace.openLinkText(path, "", e.ctrlKey || e.metaKey);
      });
      const list = root.createEl("ul", { cls: "infra-ledger-list" });
      for (const hit of this.results.get(path)!) this.renderHit(list, path, hit);
    }
  }

  private renderHit(list: HTMLElement, path: string, hit: ScanHit): void {
    const f = hit.finding;
    const key = `${path}:${f.start}`;
    const li = list.createEl("li", { cls: `infra-ledger-hit is-${f.confidence}` });
    const top = li.createDiv({ cls: "infra-ledger-hit-top" });
    top.createSpan({ cls: "infra-ledger-meta", text: `line ${f.line + 1} · ${f.kind} · ${f.confidence}` });
    const actions = top.createSpan({ cls: "infra-ledger-actions" });
    this.button(actions, this.revealed.has(key) ? "eye-off" : "eye", "Show", () => {
      if (this.revealed.has(key)) this.revealed.delete(key);
      else this.revealed.add(key);
      this.render();
    });
    this.button(actions, "file-input", "Import into a resource", () => {
      new ImportSecretModal(this.app, this.plugin, path, f, () => void this.rescan(path)).open();
    });
    this.button(actions, "x", "Ignore", () => void this.ignore(path, hit));

    const body = li.createDiv();
    body.createSpan({ text: `${f.label}: ` });
    body.createSpan({ cls: "infra-ledger-mono", text: this.revealed.has(key) ? f.value : maskSecret(f.value) });
    const extra = [f.user && `user ${f.user}`, f.host && `host ${f.host}`].filter(Boolean).join(" · ");
    if (extra) li.createDiv({ cls: "infra-ledger-meta", text: extra });
  }

  private async ignore(path: string, hit: ScanHit): Promise<void> {
    const list = this.plugin.settings.ignoredFindings;
    if (!list.includes(hit.hash)) list.push(hit.hash);
    await this.plugin.saveSettings();
    this.plugin.notify("Ignored. It won't show up in scans again.");
    await this.rescan(path);
  }

  private button(parent: HTMLElement, icon: string, label: string, onClick: () => void): void {
    const b = parent.createEl("button", { cls: "clickable-icon infra-ledger-button", attr: { "aria-label": label } });
    setIcon(b, icon);
    setTooltip(b, label);
    b.addEventListener("click", (e) => {
      e.preventDefault();
      onClick();
    });
  }
}
