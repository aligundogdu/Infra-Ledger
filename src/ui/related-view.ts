import { MarkdownRenderChild, setIcon, setTooltip } from "obsidian";
import { relatedTo, type HeldPeriod, type RelatedItem } from "../inventory/related";
import type InfraLedgerPlugin from "../main";

/** Renders a ```related block: everything in the vault that points at this note. */
export class RelatedBlockView extends MarkdownRenderChild {
  constructor(
    containerEl: HTMLElement,
    private readonly plugin: InfraLedgerPlugin,
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
    el.addClass("infra-ledger-block", "infra-ledger-related");
    const name = (this.sourcePath.split("/").pop() ?? this.sourcePath).replace(/\.md$/, "");
    const { metadataCache } = this.plugin.app;
    const r = relatedTo(this.plugin.index.snapshot, this.sourcePath, name, (link, from) => {
      return metadataCache.getFirstLinkpathDest(link.split("#")[0], from)?.path ?? null;
    });

    if (r.holding.length + r.held.length + r.located.length + r.provided.length === 0) {
      el.createDiv({ cls: "infra-ledger-empty", text: "Nothing points here yet. Assign a device, or set location or provider on a resource to this note." });
      return;
    }
    if (r.holding.length > 0) {
      this.section(el, "Has now", r.holding, (li, item) => {
        if (item.since) li.createSpan({ cls: "infra-ledger-meta", text: `  since ${item.since}` });
        this.returnButton(li, item);
      });
    }
    if (r.held.length > 0) this.history(el, r.held);
    if (r.located.length > 0) this.section(el, "Located here", r.located);
    if (r.provided.length > 0) this.section(el, "Provided here", r.provided);
  }

  private section(
    el: HTMLElement,
    title: string,
    items: RelatedItem[],
    extra?: (li: HTMLElement, item: RelatedItem) => void,
  ): void {
    el.createDiv({ cls: "infra-ledger-group-title", text: `${title} · ${items.length}` });
    const list = el.createEl("ul", { cls: "infra-ledger-list" });
    for (const item of items) {
      const li = list.createEl("li");
      this.link(li, item.path, item.name);
      const meta = [item.type, item.detail].filter(Boolean).join(" · ");
      li.createSpan({ cls: "infra-ledger-meta", text: `  ${meta}` });
      extra?.(li, item);
    }
  }

  private history(el: HTMLElement, periods: HeldPeriod[]): void {
    el.createDiv({ cls: "infra-ledger-group-title", text: `Had before · ${periods.length}` });
    const list = el.createEl("ul", { cls: "infra-ledger-list" });
    for (const p of periods) {
      const li = list.createEl("li");
      this.link(li, p.path, p.name);
      li.createSpan({ cls: "infra-ledger-meta", text: `  ${p.from} → ${p.until}` });
    }
  }

  private link(parent: HTMLElement, path: string, text: string): void {
    const a = parent.createEl("a", { cls: "internal-link", text, href: path });
    a.addEventListener("click", (e) => {
      e.preventDefault();
      void this.plugin.app.workspace.openLinkText(path, this.sourcePath, e.ctrlKey || e.metaKey);
    });
  }

  private returnButton(li: HTMLElement, item: RelatedItem): void {
    const b = li.createEl("button", { cls: "clickable-icon infra-ledger-button", attr: { "aria-label": "Return" } });
    setIcon(b, "undo-2");
    setTooltip(b, `Return ${item.name}`);
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.plugin.openReturn(item.path);
    });
  }
}
