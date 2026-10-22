import { ItemView, moment, setIcon, type WorkspaceLeaf } from "obsidian";
import {
  buildRows, filterOptions, filterRows, sortRows, usedColumns,
  type Filters, type InventoryRow, type OptionField, type SortDir, type SortKey,
} from "../inventory/rows";
import { groupByHolder } from "../inventory/people";
import { computeWarnings, type Warning, type WarningGroup } from "../inventory/warnings";
import type InfraLedgerPlugin from "../main";

export const INVENTORY_VIEW = "infra-ledger-inventory";

type Tab = "resources" | "people" | "warnings";

const COLUMNS: { key: SortKey; title: string; numeric?: boolean; unit?: string }[] = [
  { key: "name", title: "Name" },
  { key: "type", title: "Type" },
  { key: "space", title: "Space" },
  { key: "detail", title: "Detail" },
  { key: "provider", title: "Provider" },
  { key: "location", title: "Location" },
  { key: "holder", title: "Holder" },
  { key: "addresses", title: "Addr", numeric: true, unit: "addr" },
  { key: "credentials", title: "Creds", numeric: true, unit: "cred" },
];

const FILTER_FIELDS: { key: OptionField; title: string }[] = [
  { key: "type", title: "Type" },
  { key: "space", title: "Space" },
  { key: "provider", title: "Provider" },
  { key: "location", title: "Location" },
  { key: "holder", title: "Holder" },
];

const WARNING_TITLES: Record<WarningGroup, string> = {
  warranty: "Warranty",
  password: "Password age",
  ids: "Duplicate ids",
  refs: "References",
  sync: "Sync copies",
  blocks: "Block problems",
};

export class InventoryView extends ItemView {
  private tab: Tab = "resources";
  private filters: Filters = { text: "" };
  private sort: { key: SortKey; dir: SortDir } = { key: "name", dir: "asc" };
  private bodyEl!: HTMLElement;
  private tableEl: HTMLElement | null = null;
  private sortSelect: HTMLSelectElement | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: InfraLedgerPlugin) {
    super(leaf);
  }

  override getViewType(): string {
    return INVENTORY_VIEW;
  }

  override getDisplayText(): string {
    return "Inventory";
  }

  override getIcon(): string {
    return "layout-list";
  }

  override async onOpen(): Promise<void> {
    this.registerEvent(this.plugin.index.on("changed", () => this.render()));
    this.render();
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    try {
      this.draw();
    } catch (e) {
      // Show the failure in the panel itself, so a blank panel never hides a bug.
      console.error("Infra Ledger inventory", e);
      const root = this.contentEl;
      root.empty();
      root.createEl("p", { cls: "infra-ledger-modal-error", text: `The inventory couldn't be drawn: ${(e as Error).message}` });
      root.createEl("pre", { cls: "infra-ledger-mono", text: (e as Error).stack ?? "" });
    }
  }

  private draw(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("infra-ledger-inventory");
    const warnings = this.warnings();
    const tabs = root.createDiv({ cls: "infra-ledger-tabs" });
    for (const [tab, label] of [
      ["resources", `Resources (${this.plugin.index.snapshot.resources.length})`],
      ["people", "People"],
      ["warnings", `Warnings (${warnings.length})`],
    ] as const) {
      const b = tabs.createEl("button", { text: label, cls: tab === this.tab ? "is-active" : "" });
      b.addEventListener("click", () => {
        this.tab = tab;
        this.render();
      });
    }
    this.bodyEl = root.createDiv({ cls: "infra-ledger-inventory-body" });
    if (this.tab === "resources") this.renderResources();
    else if (this.tab === "people") this.renderPeople();
    else this.renderWarnings(warnings);
  }

  private renderResources(): void {
    const rows = buildRows(this.plugin.index.snapshot);
    const options = filterOptions(rows);
    const bar = this.bodyEl.createDiv({ cls: "infra-ledger-filters" });

    const input = bar.createEl("input", {
      type: "search",
      cls: "infra-ledger-filter-text",
      attr: { placeholder: "Filter, e.g. laptop or @work prod" },
    });
    input.value = this.filters.text;
    input.addEventListener("input", () => {
      this.filters.text = input.value;
      this.renderTable(rows);
    });

    for (const f of FILTER_FIELDS) {
      if (options[f.key].length === 0) continue;
      const select = bar.createEl("select", { cls: "dropdown" });
      select.createEl("option", { text: `${f.title}: any`, value: "" });
      for (const v of options[f.key]) select.createEl("option", { text: v, value: v });
      select.value = this.filters[f.key] ?? "";
      select.addEventListener("change", () => {
        if (select.value) this.filters[f.key] = select.value;
        else delete this.filters[f.key];
        this.renderTable(rows);
      });
    }

    // Column headers disappear in the narrow card layout, so sorting also has its own menu.
    const sort = bar.createEl("select", { cls: "dropdown infra-ledger-sort" });
    for (const col of COLUMNS) {
      for (const dir of ["asc", "desc"] as const) {
        sort.createEl("option", { text: `Sort: ${col.title} ${dir === "asc" ? "▲" : "▼"}`, value: `${col.key}:${dir}` });
      }
    }
    sort.addEventListener("change", () => {
      const [key, dir] = sort.value.split(":") as [SortKey, SortDir];
      this.sort = { key, dir };
      this.renderTable(rows);
    });
    this.sortSelect = sort;

    this.tableEl = this.bodyEl.createDiv({ cls: "infra-ledger-table-wrap" });
    this.renderTable(rows);
  }

  private renderTable(all: InventoryRow[]): void {
    const wrap = this.tableEl!;
    wrap.empty();
    const spaces = this.plugin.namedSpaces().map((s) => s.name);
    const rows = sortRows(filterRows(all, this.filters, spaces), this.sort.key, this.sort.dir);
    if (this.sortSelect) this.sortSelect.value = `${this.sort.key}:${this.sort.dir}`;
    if (rows.length === 0) {
      wrap.createDiv({
        cls: "infra-ledger-empty",
        text: all.length === 0 ? 'No resources yet. Run "Infra Ledger: New resource" to add one.' : "Nothing matches these filters.",
      });
      return;
    }
    const used = new Set(usedColumns(rows, COLUMNS.map((c) => c.key)));
    const columns = COLUMNS.filter((c) => used.has(c.key));
    const table = wrap.createEl("table", { cls: "infra-ledger-table infra-ledger-inventory-table" });
    const head = table.createEl("thead").createEl("tr");
    for (const col of columns) {
      const th = head.createEl("th", { cls: col.numeric ? "is-numeric" : "" });
      th.setText(col.title + (this.sort.key === col.key ? (this.sort.dir === "asc" ? " ▲" : " ▼") : ""));
      th.addEventListener("click", () => {
        this.sort =
          this.sort.key === col.key
            ? { key: col.key, dir: this.sort.dir === "asc" ? "desc" : "asc" }
            : { key: col.key, dir: col.numeric ? "desc" : "asc" };
        this.renderTable(all);
      });
    }
    const body = table.createEl("tbody");
    for (const r of rows) {
      const tr = body.createEl("tr", { cls: "infra-ledger-row is-clickable" });
      tr.addEventListener("click", (e) => this.openNote(r.path, e));
      for (const col of columns) {
        const value = r[col.key];
        const td = tr.createEl("td", {
          text: value === undefined ? "" : String(value),
          cls: [col.key === "name" ? "is-name" : "is-meta", col.numeric ? "is-numeric" : ""].filter(Boolean).join(" "),
        });
        // Units show only in the narrow card layout, where there are no column headers.
        if (col.unit) td.dataset.unit = value === 1 || col.unit === "addr" ? col.unit : `${col.unit}s`;
        if (value === 0) td.dataset.zero = "";
      }
    }
  }

  private renderPeople(): void {
    const { groups, unassigned } = groupByHolder(this.plugin.index.snapshot);
    if (groups.length === 0 && unassigned.length === 0) {
      this.bodyEl.createDiv({ cls: "infra-ledger-empty", text: "No devices yet. Create one with New resource → device." });
      return;
    }
    for (const g of groups) {
      const head = this.bodyEl.createDiv({ cls: "infra-ledger-group-title" });
      if (g.link) {
        const link = g.link;
        const a = head.createEl("a", { cls: "internal-link", text: g.holder, href: link });
        a.addEventListener("click", (e) => {
          e.preventDefault();
          void this.app.workspace.openLinkText(link, "", e.ctrlKey || e.metaKey);
        });
      } else {
        head.appendText(g.holder);
      }
      head.appendText(` · ${g.devices.length}`);
      this.deviceList(g.devices.map((d) => ({ ...d, extra: d.since ? `since ${d.since}` : "" })));
    }
    if (unassigned.length > 0) {
      this.bodyEl.createDiv({ cls: "infra-ledger-group-title", text: `Not assigned · ${unassigned.length}` });
      this.deviceList(unassigned.map((d) => ({ ...d, extra: "" })));
    }
  }

  private deviceList(devices: { path: string; name: string; deviceType?: string; model?: string; extra: string }[]): void {
    const list = this.bodyEl.createEl("ul", { cls: "infra-ledger-list" });
    for (const d of devices) {
      const li = list.createEl("li", { cls: "is-clickable" });
      li.createSpan({ text: d.name });
      const meta = [d.deviceType, d.model, d.extra].filter(Boolean).join(" · ");
      if (meta) li.createSpan({ cls: "infra-ledger-meta", text: `  ${meta}` });
      li.addEventListener("click", (e) => this.openNote(d.path, e));
    }
  }

  private renderWarnings(warnings: Warning[]): void {
    if (warnings.length === 0) {
      const ok = this.bodyEl.createDiv({ cls: "infra-ledger-empty" });
      setIcon(ok.createSpan(), "check");
      ok.appendText(" Nothing to fix.");
      return;
    }
    for (const group of Object.keys(WARNING_TITLES) as WarningGroup[]) {
      const items = warnings.filter((w) => w.group === group);
      if (items.length === 0) continue;
      this.bodyEl.createDiv({ cls: "infra-ledger-group-title", text: `${WARNING_TITLES[group]} · ${items.length}` });
      const list = this.bodyEl.createEl("ul", { cls: "infra-ledger-list" });
      for (const w of items) {
        const li = list.createEl("li", { text: w.message, cls: w.path ? "is-clickable" : "" });
        const path = w.path;
        if (path) li.addEventListener("click", (e) => this.openNote(path, e));
      }
    }
  }

  private warnings(): Warning[] {
    const s = this.plugin.settings;
    return computeWarnings(this.plugin.index.snapshot, moment().format("YYYY-MM-DD"), {
      warrantyWarnDays: s.warrantyWarnDays,
      passwordMaxAgeDays: s.passwordMaxAgeDays,
    });
  }

  private openNote(path: string, e: MouseEvent): void {
    void this.app.workspace.openLinkText(path, "", e.ctrlKey || e.metaKey);
  }
}
