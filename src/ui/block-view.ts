import { MarkdownRenderChild, setIcon, setTooltip } from "obsidian";
import { parseCredsBlock } from "../creds/parse";
import type { Credential, CredRef } from "../model";
import type { IndexedCredential, LedgerSnapshot } from "../index/core";
import type InfraLedgerPlugin from "../main";

const MASK = "••••••••••";

/** Renders one ```creds block as a table and re-renders when the index changes. */
export class CredsBlockView extends MarkdownRenderChild {
  private revealed = new Set<string>();
  private revealTimers = new Map<string, number>();

  constructor(
    containerEl: HTMLElement,
    private readonly plugin: InfraLedgerPlugin,
    private readonly source: string,
    private readonly sourcePath: string,
  ) {
    super(containerEl);
  }

  override onload(): void {
    this.render();
    this.registerEvent(this.plugin.index.on("changed", () => this.render()));
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
    this.renderSecret(row, cred.id, cred.secret);

    const actions = row.createEl("td", { cls: "infra-ledger-actions" });
    this.renderCopyButtons(actions, cred);
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
    this.renderSecret(row, `ref:${ref.index}:${cred.id}`, cred.secret);
    this.renderCopyButtons(row.createEl("td", { cls: "infra-ledger-actions" }), cred);
  }

  private renderUser(row: HTMLElement, user?: string): void {
    const cell = row.createEl("td", { cls: "infra-ledger-user" });
    if (user) cell.createSpan({ cls: "infra-ledger-mono", text: user });
  }

  private renderSecret(row: HTMLElement, key: string, secret?: string): void {
    const cell = row.createEl("td", { cls: "infra-ledger-secret" });
    if (secret === undefined) return;
    const shown = this.revealed.has(key);
    cell.createSpan({ cls: "infra-ledger-mono", text: shown ? secret : MASK });
    this.button(cell, shown ? "eye-off" : "eye", shown ? "Hide" : "Show", () => this.toggleReveal(key));
  }

  private renderCopyButtons(cell: HTMLElement, cred: Credential): void {
    if (cred.user) this.button(cell, "user", "Copy username", () => void this.plugin.copyUser(cred.user!));
    if (cred.secret !== undefined) this.button(cell, "copy", "Copy secret", () => void this.plugin.copySecret(cred.secret!));
  }

  private toggleReveal(key: string): void {
    const old = this.revealTimers.get(key);
    if (old !== undefined) window.clearTimeout(old);
    this.revealTimers.delete(key);
    if (this.revealed.has(key)) {
      this.revealed.delete(key);
    } else {
      this.revealed.add(key);
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
