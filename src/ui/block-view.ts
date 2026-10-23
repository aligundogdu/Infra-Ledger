import { MarkdownRenderChild, setIcon, setTooltip } from "obsidian";
import { parseCredsBlock } from "../creds/parse";
import { isEncrypted } from "../crypto/keys";
import type { Credential, CredRef } from "../model";
import type { IndexedCredential, LedgerSnapshot } from "../index/core";
import type InfraLedgerPlugin from "../main";

const MASK = "••••••••••";

/** Renders one ```creds block as a table and re-renders when the index changes. */
export class CredsBlockView extends MarkdownRenderChild {
  /** Revealed plaintexts by row key; dropped when the vault locks. */
  private revealed = new Map<string, string>();
  private revealTimers = new Map<string, number>();

  constructor(
    containerEl: HTMLElement,
    private readonly plugin: InfraLedgerPlugin,
    private readonly source: string,
    private sourcePath: string,
    private readonly showResource: boolean,
  ) {
    super(containerEl);
  }

  override onload(): void {
    this.render();
    this.registerEvent(this.plugin.index.on("changed", () => this.render()));
    // Obsidian keeps rendered blocks when their note moves; follow the note so actions write to it.
    this.registerEvent(
      this.plugin.app.vault.on("rename", (file, oldPath) => {
        if (oldPath !== this.sourcePath) return;
        this.sourcePath = file.path;
        this.render();
      }),
    );
  }

  override onunload(): void {
    for (const t of this.revealTimers.values()) window.clearTimeout(t);
  }

  private render(): void {
    const el = this.containerEl;
    el.empty();
    el.addClass("infra-ledger-block");
    const parsed = parseCredsBlock(this.source);

    if (!parsed.ok) {
      const issue = parsed.issues[0];
      const box = el.createDiv({ cls: "infra-ledger-error" });
      setIcon(box.createSpan({ cls: "infra-ledger-error-icon" }), "alert-triangle");
      box.createSpan({
        text:
          issue.code === "yaml"
            ? `Can't read this block: YAML error on line ${issue.line ?? "?"}. Fix it in source mode.`
            : "Can't read this block: it must be a YAML list of credentials. Fix it in source mode.",
      });
      return;
    }

    const snapshot = this.plugin.index.snapshot;
    if (this.showResource) this.renderResource(el, snapshot);
    if (parsed.entries.length === 0) {
      el.createDiv({ cls: "infra-ledger-empty", text: "No credentials in this block yet." });
    } else {
      const table = el.createEl("table", { cls: "infra-ledger-table" });
      const head = table.createEl("thead").createEl("tr");
      for (const h of ["Label", "User", "Kind", "Secret", ""]) head.createEl("th", { text: h });
      const body = table.createEl("tbody");
      for (const entry of parsed.entries) {
        if (entry.type === "credential") this.renderCredential(body, entry, snapshot);
        else this.renderRef(body, entry, snapshot);
      }
    }

    const warnings = parsed.issues.filter((i) => i.level === "warning");
    if (warnings.length > 0) {
      const list = el.createEl("ul", { cls: "infra-ledger-warnings" });
      for (const w of warnings) list.createEl("li", { text: w.line ? `Line ${w.line}: ${w.message}` : w.message });
    }
    this.plugin.renderBlockFooter(el, this.sourcePath);
  }

  /** Addresses and ports of the note as copyable chips, above the first creds block. */
  private renderResource(el: HTMLElement, snapshot: LedgerSnapshot): void {
    const r = snapshot.resources.find((res) => res.path === this.sourcePath);
    if (!r) return;
    // Addresses from a network block have their own table; only properties ones become chips here.
    const chips = [
      ...r.addresses
        .filter((a) => a.source === "properties")
        .map((a) => ({ text: a.label ? `${a.value} ${a.label}` : a.value, copy: a.value })),
      ...r.ports
        .filter((p) => p.source === "properties")
        .map((p) => ({ text: p.service ? `${p.port} ${p.service}` : `${p.port}`, copy: String(p.port) })),
    ];
    if (chips.length === 0 && r.warnings.length === 0) return;
    const row = el.createDiv({ cls: "infra-ledger-resource" });
    for (const chip of chips) {
      const b = row.createEl("button", { cls: "infra-ledger-chip infra-ledger-mono", text: chip.text });
      setTooltip(b, `Copy ${chip.copy}`);
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        void this.plugin.copyText(chip.copy, `Copied ${chip.copy}.`);
      });
    }
    if (r.warnings.length > 0) {
      const list = el.createEl("ul", { cls: "infra-ledger-warnings" });
      for (const w of r.warnings) list.createEl("li", { text: w });
    }
  }

  private renderCredential(body: HTMLElement, cred: Credential, snapshot: LedgerSnapshot): void {
    const others = (snapshot.byId.get(cred.id) ?? []).filter((ic) => ic.path !== this.sourcePath);
    const sameNote = (snapshot.byId.get(cred.id) ?? []).filter((ic) => ic.path === this.sourcePath).length;
    const duplicate = others.length > 0 || sameNote > 1;
    const row = body.createEl("tr", { cls: "infra-ledger-row" });
    if (cred.updated) row.addClass("is-changed");

    const labelCell = row.createEl("td", { cls: "infra-ledger-label" });
    labelCell.createDiv({ text: cred.label });
    if (cred.updated) labelCell.createDiv({ cls: "infra-ledger-meta", text: `changed ${cred.updated}` });
    if (cred.note) labelCell.createDiv({ cls: "infra-ledger-note", text: cred.note });

    this.renderUser(row, cred.user);
    row.createEl("td", { cls: "infra-ledger-kind", text: cred.kind });
    this.renderSecret(row, cred.id, cred);

    const actions = row.createEl("td", { cls: "infra-ledger-actions" });
    this.renderCopyButtons(actions, cred);
    this.plugin.renderSshButton(actions, cred, this.sourcePath);
    this.plugin.renderRowActions(actions, cred, this.sourcePath, duplicate);

    if (duplicate) {
      const paths = [...new Set([this.sourcePath, ...others.map((o) => o.path)])].map(fileName);
      this.notice(body, `Duplicate id "${cred.id}" in ${paths.join(" and ")}. Rename one before editing.`);
    }
  }

  private renderRef(body: HTMLElement, ref: CredRef, snapshot: LedgerSnapshot): void {
    const resolved = snapshot.refs.find((r) => r.path === this.sourcePath && r.ref.index === ref.index && r.ref.ref === ref.ref);
    const status = resolved?.status ?? (snapshot.byId.get(ref.ref)?.length === 1 ? "ok" : "unresolved");
    const target: IndexedCredential | undefined = resolved?.target ?? snapshot.byId.get(ref.ref)?.[0];
    const row = body.createEl("tr", { cls: "infra-ledger-row is-ref" });

    if (status !== "ok" || !target) {
      const cell = row.createEl("td", { attr: { colspan: "5" }, cls: "infra-ledger-ref-problem" });
      cell.setText(
        status === "ambiguous"
          ? `Id "${ref.ref}" is defined in more than one note, so this ref can't be resolved. Rename one.`
          : `No credential with id "${ref.ref}". Check the spelling or define it in a resource note.`,
      );
      return;
    }

    const cred = target.cred;
    const labelCell = row.createEl("td", { cls: "infra-ledger-label" });
    labelCell.createDiv({ text: cred.label });
    const via = labelCell.createDiv({ cls: "infra-ledger-meta" });
    via.appendText("from ");
    const link = via.createEl("a", { cls: "internal-link", text: fileName(target.path), href: target.path });
    link.addEventListener("click", (e) => {
      e.preventDefault();
      void this.plugin.app.workspace.openLinkText(target.path, this.sourcePath, e.ctrlKey || e.metaKey);
    });

    this.renderUser(row, cred.user);
    row.createEl("td", { cls: "infra-ledger-kind", text: cred.kind });
    this.renderSecret(row, `ref:${ref.index}:${cred.id}`, cred);
    const actions = row.createEl("td", { cls: "infra-ledger-actions" });
    this.renderCopyButtons(actions, cred);
    // A shared key is used from this note: log in to this note's addresses.
    this.plugin.renderSshButton(actions, cred, this.sourcePath);
  }

  private renderUser(row: HTMLElement, user?: string): void {
    const cell = row.createEl("td", { cls: "infra-ledger-user" });
    if (user) cell.createSpan({ cls: "infra-ledger-mono", text: user });
  }

  private renderSecret(row: HTMLElement, key: string, cred: Credential): void {
    const cell = row.createEl("td", { cls: "infra-ledger-secret" });
    if (cred.auth === "key") {
      const k = cell.createDiv({ cls: "infra-ledger-key" });
      setIcon(k.createSpan({ cls: "infra-ledger-lock" }), "key-round");
      const file = cred.keyPath ? (cred.keyPath.split(/[\\/]/).pop() ?? cred.keyPath) : "key file not set";
      const name = k.createSpan({ cls: "infra-ledger-mono", text: file });
      if (cred.keyPath) setTooltip(name, cred.keyPath);
    }
    const secret = cred.secret;
    if (secret === undefined) return;
    const encrypted = isEncrypted(secret);
    if (encrypted && !this.plugin.encryption.unlocked()) this.revealed.delete(key);
    const shown = this.revealed.get(key);
    if (encrypted && shown === undefined) {
      const lock = cell.createSpan({ cls: "infra-ledger-lock" });
      setIcon(lock, "lock");
      setTooltip(lock, this.plugin.encryption.unlocked() ? "Encrypted" : "Encrypted, locked");
    }
    cell.createSpan({ cls: "infra-ledger-mono", text: shown ?? MASK });
    this.button(cell, shown !== undefined ? "eye-off" : "eye", shown !== undefined ? "Hide" : "Show", () =>
      void this.toggleReveal(key, secret),
    );
  }

  private renderCopyButtons(cell: HTMLElement, cred: Credential): void {
    if (cred.user) this.button(cell, "user", "Copy username", () => void this.plugin.copyUser(cred.user!));
    const what = cred.auth === "key" ? "Copy passphrase" : "Copy secret";
    if (cred.secret !== undefined) this.button(cell, "copy", what, () => void this.plugin.copySecret(cred.secret!));
  }

  private async toggleReveal(key: string, secret: string): Promise<void> {
    const old = this.revealTimers.get(key);
    if (old !== undefined) window.clearTimeout(old);
    this.revealTimers.delete(key);
    if (this.revealed.has(key)) {
      this.revealed.delete(key);
    } else {
      const plain = await this.plugin.encryption.reveal(secret);
      if (plain === null) return;
      this.revealed.set(key, plain);
      this.revealTimers.set(
        key,
        window.setTimeout(() => {
          this.revealed.delete(key);
          this.revealTimers.delete(key);
          this.render();
        }, this.plugin.settings.revealSec * 1000),
      );
    }
    this.render();
  }

  private button(parent: HTMLElement, icon: string, label: string, onClick: () => void): HTMLElement {
    const b = parent.createEl("button", { cls: "clickable-icon infra-ledger-button", attr: { "aria-label": label } });
    setIcon(b, icon);
    setTooltip(b, label);
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  private notice(body: HTMLElement, text: string): void {
    body.createEl("tr", { cls: "infra-ledger-row-notice" }).createEl("td", { attr: { colspan: "5" }, text });
  }
}

export function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}
