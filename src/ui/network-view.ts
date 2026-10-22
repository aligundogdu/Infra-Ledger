import { MarkdownRenderChild, setIcon, setTooltip } from "obsidian";
import { parseNetworkBlock, type NetAddress, type NetPort, type Scope } from "../network/parse";
import { sshCommand } from "../util/ssh";
import { ConfirmModal } from "./confirm-modal";
import type InfraLedgerPlugin from "../main";

const SCOPE_TITLES: Record<Scope, string> = { public: "Public", private: "Private", vpn: "VPN", other: "Other" };

/** Renders one ```network block as grouped tables of addresses and ports. */
export class NetworkBlockView extends MarkdownRenderChild {
  constructor(
    containerEl: HTMLElement,
    private readonly plugin: InfraLedgerPlugin,
    private readonly source: string,
    private readonly sourcePath: string,
    /** Position of this block among the note's network blocks; null when unknown (no delete then). */
    private readonly ordinal: number | null,
  ) {
    super(containerEl);
  }

  override onload(): void {
    this.render();
    this.registerEvent(this.plugin.index.on("changed", () => this.render()));
  }

  private render(): void {
    const el = this.containerEl;
    el.empty();
    el.addClass("infra-ledger-block", "infra-ledger-network");
    const parsed = parseNetworkBlock(this.source);

    if (!parsed.ok) {
      const issue = parsed.issues[0];
      const box = el.createDiv({ cls: "infra-ledger-error" });
      setIcon(box.createSpan({ cls: "infra-ledger-error-icon" }), "alert-triangle");
      box.createSpan({
        text:
          issue.code === "yaml"
            ? `Can't read this block: YAML error on line ${issue.line ?? "?"}. Fix it in source mode.`
            : "Can't read this block: it must be a YAML list of addresses and ports. Fix it in source mode.",
      });
      return;
    }

    const addresses = parsed.entries.filter((e): e is NetAddress => e.type === "address");
    const ports = parsed.entries.filter((e): e is NetPort => e.type === "port");
    if (addresses.length === 0 && ports.length === 0) {
      el.createDiv({ cls: "infra-ledger-empty", text: "No addresses or ports in this block yet." });
    }

    for (const scope of Object.keys(SCOPE_TITLES) as Scope[]) {
      const group = addresses.filter((a) => a.scope === scope);
      if (group.length === 0) continue;
      const table = this.table(el, SCOPE_TITLES[scope], ["Address", "Interface", "Details", ""]);
      for (const a of group) this.renderAddress(table, a);
    }
    if (ports.length > 0) {
      const table = this.table(el, "Ports", ["Port", "Service", "Details", ""]);
      for (const p of ports) this.renderPort(table, p);
    }

    const warnings = parsed.issues.filter((i) => i.level === "warning");
    if (warnings.length > 0) {
      const list = el.createEl("ul", { cls: "infra-ledger-warnings" });
      for (const w of warnings) list.createEl("li", { text: w.line ? `Line ${w.line}: ${w.message}` : w.message });
    }

    const footer = el.createDiv({ cls: "infra-ledger-footer" });
    this.footerButton(footer, "Add address", () => this.plugin.openAddAddress(this.sourcePath));
    this.footerButton(footer, "Add port", () => this.plugin.openAddPort(this.sourcePath));
  }

  private table(el: HTMLElement, title: string, headers: string[]): HTMLElement {
    el.createDiv({ cls: "infra-ledger-group-title", text: title });
    const table = el.createEl("table", { cls: "infra-ledger-table" });
    const head = table.createEl("thead").createEl("tr");
    for (const h of headers) head.createEl("th", { text: h });
    return table.createEl("tbody");
  }

  private renderAddress(body: HTMLElement, a: NetAddress): void {
    const row = body.createEl("tr", { cls: "infra-ledger-row" });
    const main = row.createEl("td");
    main.createDiv({ cls: "infra-ledger-mono", text: a.cidr ? `${a.value}/${a.cidr}` : a.value });
    const sub = [a.label, a.scopeGuessed ? `${a.scope} (guessed)` : null].filter(Boolean).join(" · ");
    if (sub) main.createDiv({ cls: "infra-ledger-meta", text: sub });

    const iface = row.createEl("td", { cls: "infra-ledger-mono infra-ledger-note" });
    for (const line of [a.iface, a.mac, a.vlan && `vlan ${a.vlan}`, a.gateway && `gw ${a.gateway}`]) {
      if (line) iface.createDiv({ text: line });
    }
    this.details(row.createEl("td"), a.note, a.extra);

    const actions = row.createEl("td", { cls: "infra-ledger-actions" });
    this.button(actions, "copy", "Copy address", () => void this.plugin.copyText(a.value, `Copied ${a.value}.`));
    this.button(actions, "terminal", "Copy SSH command", () => {
      const r = this.plugin.index.snapshot.resources.find((res) => res.path === this.sourcePath);
      const cmd = sshCommand(a.value, r?.sshPort ?? 22, this.plugin.sshUserFor(this.sourcePath));
      void this.plugin.copyText(cmd, `SSH command copied: ${cmd}`);
    });
    this.deleteButton(actions, a.index, a.value, a.label ?? a.value);
  }

  private renderPort(body: HTMLElement, p: NetPort): void {
    const row = body.createEl("tr", { cls: "infra-ledger-row" });
    row.createEl("td", { cls: "infra-ledger-mono", text: `${p.port}/${p.proto}` });
    row.createEl("td", { text: p.service ?? "" });
    this.details(row.createEl("td"), p.note, p.extra);
    const actions = row.createEl("td", { cls: "infra-ledger-actions" });
    this.button(actions, "copy", "Copy port", () => void this.plugin.copyText(String(p.port), `Copied ${p.port}.`));
    this.deleteButton(actions, p.index, String(p.port), p.service ? `${p.port} ${p.service}` : `port ${p.port}`);
  }

  private details(cell: HTMLElement, note: string | undefined, extra: Record<string, string>): void {
    cell.addClass("infra-ledger-note");
    if (note) cell.createDiv({ text: note });
    for (const [key, value] of Object.entries(extra)) {
      cell.createDiv({ cls: "infra-ledger-mono", text: `${key}: ${value}` });
    }
  }

  private deleteButton(cell: HTMLElement, index: number, value: string, name: string): void {
    if (this.ordinal === null) return;
    const ordinal = this.ordinal;
    this.button(cell, "trash-2", "Delete", () => {
      new ConfirmModal(this.plugin.app, "Delete entry", `Delete ${name} from this note?`, "Delete", async () => {
        await this.plugin.deleteNetworkEntry(this.sourcePath, { block: ordinal, index, value }, name);
      }).open();
    });
  }

  private button(parent: HTMLElement, icon: string, label: string, onClick: () => void): void {
    const b = parent.createEl("button", { cls: "clickable-icon infra-ledger-button", attr: { "aria-label": label } });
    setIcon(b, icon);
    setTooltip(b, label);
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
  }

  private footerButton(parent: HTMLElement, label: string, onClick: () => void): void {
    const b = parent.createEl("button", { cls: "infra-ledger-add" });
    setIcon(b.createSpan(), "plus");
    b.appendText(label);
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
  }
}
