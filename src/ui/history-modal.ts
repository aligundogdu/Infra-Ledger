import { App, Modal, setIcon, setTooltip } from "obsidian";
import { ConfirmModal } from "./confirm-modal";
import { isEncrypted } from "../crypto/keys";
import type InfraLedgerPlugin from "../main";

const MASK = "••••••••••";

export class HistoryModal extends Modal {
  private revealed = new Map<number, string>();
  private unsubscribe: (() => void) | null = null;

  constructor(
    app: App,
    private readonly plugin: InfraLedgerPlugin,
    private readonly id: string,
    private readonly path: string,
  ) {
    super(app);
  }

  override onOpen(): void {
    const ref = this.plugin.index.on("changed", () => this.render());
    this.unsubscribe = () => this.plugin.index.offref(ref);
    this.render();
  }

  override onClose(): void {
    this.unsubscribe?.();
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    const path = this.plugin.paths.current(this.path);
    const ic = this.plugin.index.snapshot.byId.get(this.id)?.find((c) => c.path === path);
    if (!ic) {
      this.titleEl.setText("History");
      contentEl.createEl("p", { text: `Credential "${this.id}" is no longer in this note.` });
      return;
    }
    const cred = ic.cred;
    this.titleEl.setText(`History: ${cred.label}`);

    if (cred.history.length === 0) {
      contentEl.createEl("p", { cls: "infra-ledger-empty", text: "No previous passwords yet." });
      return;
    }

    const table = contentEl.createEl("table", { cls: "infra-ledger-table infra-ledger-history" });
    const head = table.createEl("thead").createEl("tr");
    for (const h of ["Until", "Reason", "Password", ""]) head.createEl("th", { text: h });
    const body = table.createEl("tbody");

    cred.history.forEach((h, i) => {
      const row = body.createEl("tr");
      row.createEl("td", { cls: "infra-ledger-meta", text: h.until || "unknown" });
      row.createEl("td", { cls: "infra-ledger-note", text: h.reason ?? "" });
      const secretCell = row.createEl("td", { cls: "infra-ledger-secret" });
      if (isEncrypted(h.secret) && !this.plugin.encryption.unlocked()) this.revealed.delete(i);
      const shown = this.revealed.get(i);
      if (isEncrypted(h.secret) && shown === undefined) setIcon(secretCell.createSpan({ cls: "infra-ledger-lock" }), "lock");
      secretCell.createSpan({ cls: "infra-ledger-mono", text: shown ?? MASK });
      const actions = row.createEl("td", { cls: "infra-ledger-actions" });
      this.button(secretCell, shown !== undefined ? "eye-off" : "eye", shown !== undefined ? "Hide" : "Show", async () => {
        if (shown !== undefined) {
          this.revealed.delete(i);
        } else {
          const plain = await this.plugin.encryption.reveal(h.secret);
          if (plain === null) return;
          this.revealed.set(i, plain);
        }
        this.render();
      });
      this.button(actions, "copy", "Copy password", () => void this.plugin.copySecret(h.secret));
      this.button(actions, "trash-2", "Delete this entry", () => {
        if (ic.duplicate) {
          this.plugin.notify(`Duplicate id "${this.id}". Rename one before editing.`);
          return;
        }
        new ConfirmModal(
          this.app,
          "Delete history entry",
          `Delete the password used until ${h.until || "an unknown date"}? This can't be undone from Infra Ledger.`,
          "Delete",
          async () => {
            this.revealed.clear();
            await this.plugin.deleteHistoryEntry(this.path, this.id, i);
          },
        ).open();
      });
    });
  }

  private button(parent: HTMLElement, icon: string, label: string, onClick: () => void): void {
    const b = parent.createEl("button", { cls: "clickable-icon infra-ledger-button", attr: { "aria-label": label } });
    setIcon(b, icon);
    setTooltip(b, label);
    b.addEventListener("click", onClick);
  }
}
