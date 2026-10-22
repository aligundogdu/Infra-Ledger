import { MarkdownRenderChild, setIcon } from "obsidian";
import { ledgerStatus, parseLedgerBlock, type LedgerEvent, type LedgerStatus } from "../ledger/parse";
import type { LinkValue } from "../links";
import type InfraLedgerPlugin from "../main";

const EVENT_ICONS: Record<LedgerEvent["event"], string> = {
  assigned: "user-check",
  returned: "undo-2",
  service: "wrench",
  repair: "hammer",
  upgrade: "arrow-up-circle",
  moved: "truck",
  lost: "help-circle",
  retired: "archive",
  note: "sticky-note",
};

/** Renders a ```ledger block as a timeline with the current assignment on top. */
export class LedgerBlockView extends MarkdownRenderChild {
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

  private render(): void {
    const el = this.containerEl;
    el.empty();
    el.addClass("infra-ledger-block", "infra-ledger-log");
    const parsed = parseLedgerBlock(this.source);
    if (!parsed.ok) {
      const issue = parsed.issues[0];
      const box = el.createDiv({ cls: "infra-ledger-error" });
      setIcon(box.createSpan(), "alert-triangle");
      box.createSpan({
        text:
          issue.code === "yaml"
            ? `Can't read this block: YAML error on line ${issue.line ?? "?"}. Fix it in source mode.`
            : "Can't read this block: it must be a YAML list of events. Fix it in source mode.",
      });
      return;
    }

    const resource = this.plugin.index.snapshot.resources.find((r) => r.path === this.sourcePath);
    const status = resource?.status ?? ledgerStatus(parsed.events, null);
    this.renderStatus(el, status);

    if (parsed.events.length === 0) {
      el.createDiv({ cls: "infra-ledger-empty", text: "No events yet." });
    } else {
      const list = el.createEl("ol", { cls: "infra-ledger-timeline" });
      for (const e of parsed.events) this.renderEvent(list, e);
    }

    const warnings = parsed.issues.filter((i) => i.level === "warning");
    if (warnings.length > 0) {
      const list = el.createEl("ul", { cls: "infra-ledger-warnings" });
      for (const w of warnings) list.createEl("li", { text: w.line ? `Line ${w.line}: ${w.message}` : w.message });
    }

    const footer = el.createDiv({ cls: "infra-ledger-footer" });
    if (status.kind !== "retired") {
      this.footerButton(footer, "user-check", "Assign", () => this.plugin.openAssign(this.sourcePath));
    }
    if (status.kind === "assigned") {
      this.footerButton(footer, "undo-2", "Return", () => this.plugin.openReturn(this.sourcePath));
    }
    this.footerButton(footer, "plus", "Add event", () => this.plugin.openAddEvent(this.sourcePath));
  }

  private renderStatus(el: HTMLElement, status: LedgerStatus): void {
    const line = el.createDiv({ cls: "infra-ledger-status" });
    if (status.kind === "retired") {
      line.setText(`Retired ${status.since}`);
    } else if (status.kind === "unassigned") {
      line.setText("Not assigned");
    } else {
      line.appendText("Assigned to ");
      this.person(line, status.who);
      if (status.since) line.appendText(` since ${status.since}`);
    }
  }

  private renderEvent(list: HTMLElement, e: LedgerEvent): void {
    const item = list.createEl("li", { cls: `infra-ledger-event is-${e.event}` });
    setIcon(item.createSpan({ cls: "infra-ledger-event-icon" }), EVENT_ICONS[e.event]);
    const body = item.createDiv({ cls: "infra-ledger-event-body" });
    const head = body.createDiv();
    head.createSpan({ cls: "infra-ledger-meta", text: e.date });
    head.appendText(" ");
    head.createSpan({ cls: "infra-ledger-event-name", text: e.extra.event ?? e.event });
    if (e.to) {
      head.appendText(" to ");
      this.person(head, e.to);
    }
    if (e.from) {
      head.appendText(" from ");
      this.person(head, e.from);
    }
    if (e.note) body.createDiv({ cls: "infra-ledger-note", text: e.note });
    for (const [key, value] of Object.entries(e.extra)) {
      if (key !== "event") body.createDiv({ cls: "infra-ledger-note infra-ledger-mono", text: `${key}: ${value}` });
    }
  }

  private person(parent: HTMLElement, who: LinkValue): void {
    if (!who.link) {
      parent.createSpan({ text: who.display });
      return;
    }
    const target = who.link;
    const a = parent.createEl("a", { cls: "internal-link", text: who.display, href: target });
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      void this.plugin.app.workspace.openLinkText(target, this.sourcePath, ev.ctrlKey || ev.metaKey);
    });
  }

  private footerButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): void {
    const b = parent.createEl("button", { cls: "infra-ledger-add" });
    setIcon(b.createSpan(), icon);
    b.appendText(label);
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
  }
}
