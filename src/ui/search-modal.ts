import { App, Platform, SuggestModal } from "obsidian";
import { buildSearchItems, matchItems, parseQuery, type SearchItem } from "../util/search";
import { sshTargets, type SshTarget } from "../util/ssh";
import type InfraLedgerPlugin from "../main";

type Action =
  | { kind: "secret" }
  | { kind: "user" }
  | { kind: "ssh"; target?: SshTarget }
  | { kind: "open" };

export class SearchModal extends SuggestModal<SearchItem> {
  private readonly items: SearchItem[];
  private readonly spaceNames: string[];

  constructor(app: App, private readonly plugin: InfraLedgerPlugin) {
    super(app);
    this.items = buildSearchItems(plugin.index.snapshot);
    this.spaceNames = plugin.namedSpaces().map((s) => s.name);
    this.setPlaceholder(
      this.spaceNames.length > 1 ? `Search, or @${this.spaceNames[0].toLowerCase()} to pick a space` : "Search resources and credentials",
    );
    this.limit = 100;
    if (Platform.isMobile) return;
    this.setInstructions([
      { command: "↵", purpose: "copy password" },
      { command: "shift ↵", purpose: "copy username" },
      { command: Platform.isMacOS ? "cmd ↵" : "ctrl ↵", purpose: "copy SSH command" },
      { command: "alt ↵", purpose: "open note" },
    ]);
    this.scope.register(["Shift"], "Enter", (e) => this.runOnSelected(e, { kind: "user" }));
    this.scope.register(["Mod"], "Enter", (e) => this.runOnSelected(e, { kind: "ssh" }));
    this.scope.register(["Alt"], "Enter", (e) => this.runOnSelected(e, { kind: "open" }));
  }

  override getSuggestions(query: string): SearchItem[] {
    if (this.items.length === 0) {
      this.emptyStateText = 'No resources yet. Run "Infra Ledger: New resource" to add your first server.';
      return [];
    }
    const parsed = parseQuery(query, this.spaceNames);
    this.emptyStateText =
      parsed.unknownSpace !== null
        ? `No space named "${parsed.unknownSpace}". Spaces: ${this.spaceNames.join(", ")}.`
        : `No match for "${query.trim()}". Try a host, tag or username.`;
    return matchItems(query, this.items, this.spaceNames);
  }

  override renderSuggestion(item: SearchItem, el: HTMLElement): void {
    el.addClass("infra-ledger-suggestion");
    el.createDiv({ cls: "infra-ledger-suggestion-title", text: item.title });
    el.createDiv({ cls: "infra-ledger-suggestion-meta", text: item.subtitle });
  }

  override onChooseSuggestion(item: SearchItem): void {
    if (Platform.isMobile) {
      new ActionModal(this.app, item, (action) => void run(this.plugin, item, action)).open();
      return;
    }
    void run(this.plugin, item, item.kind === "resource" ? { kind: "open" } : { kind: "secret" });
  }

  private runOnSelected(e: KeyboardEvent, action: Action): false {
    e.preventDefault();
    // SuggestModal keeps its list in an undocumented "chooser"; read the highlighted row from it.
    const chooser = (this as unknown as { chooser?: { values?: SearchItem[]; selectedItem?: number } }).chooser;
    const item = chooser?.values?.[chooser.selectedItem ?? -1];
    if (item) {
      this.close();
      void run(this.plugin, item, action);
    }
    return false;
  }
}

class ActionModal extends SuggestModal<Action> {
  constructor(app: App, private readonly item: SearchItem, private readonly pick: (a: Action) => void) {
    super(app);
    this.setPlaceholder(item.title);
  }

  override getSuggestions(): Action[] {
    const c = this.item.credential?.cred;
    const actions: Action[] = [];
    if (c?.secret !== undefined) actions.push({ kind: "secret" });
    if (c?.user) actions.push({ kind: "user" });
    for (const target of targetsOf(this.item)) actions.push({ kind: "ssh", target });
    actions.push({ kind: "open" });
    return actions;
  }

  override renderSuggestion(a: Action, el: HTMLElement): void {
    el.setText(actionLabel(a));
  }

  override onChooseSuggestion(a: Action): void {
    this.pick(a);
  }
}

class SshPicker extends SuggestModal<SshTarget> {
  constructor(app: App, private readonly targets: SshTarget[], private readonly pick: (t: SshTarget) => void) {
    super(app);
    this.setPlaceholder("Pick an address");
  }

  override getSuggestions(query: string): SshTarget[] {
    const q = query.toLowerCase().trim();
    return this.targets.filter((t) => !q || `${t.label ?? ""} ${t.scope ?? ""} ${t.address}`.toLowerCase().includes(q));
  }

  override renderSuggestion(t: SshTarget, el: HTMLElement): void {
    el.createDiv({ cls: "infra-ledger-suggestion-title", text: t.label ? `${t.label} · ${t.address}` : t.address });
    el.createDiv({ cls: "infra-ledger-suggestion-meta", text: [t.scope, t.command].filter(Boolean).join(" · ") });
  }

  override onChooseSuggestion(t: SshTarget): void {
    this.pick(t);
  }
}

function actionLabel(a: Action): string {
  switch (a.kind) {
    case "secret":
      return "Copy password";
    case "user":
      return "Copy username";
    case "ssh":
      return a.target?.label ? `Copy SSH command (${a.target.label})` : `Copy SSH command (${a.target?.address ?? ""})`;
    case "open":
      return "Open note";
  }
}

function targetsOf(item: SearchItem): SshTarget[] {
  if (!item.resource) return [];
  return sshTargets(item.resource, item.credential?.cred.user);
}

async function run(plugin: InfraLedgerPlugin, item: SearchItem, action: Action): Promise<void> {
  const cred = item.credential?.cred;
  const name = cred?.label ?? item.title;
  switch (action.kind) {
    case "secret":
      if (cred?.secret !== undefined) await plugin.copySecret(cred.secret);
      else plugin.notify(`No password stored for ${name}.`);
      return;
    case "user":
      if (cred?.user) await plugin.copyUser(cred.user);
      else plugin.notify(`No username stored for ${name}.`);
      return;
    case "ssh": {
      const copy = (t: SshTarget) => void plugin.copyText(t.command, `SSH command copied: ${t.command}`);
      if (action.target) return copy(action.target);
      const targets = targetsOf(item);
      if (targets.length === 0) {
        plugin.notify(`${item.resource?.name ?? "This note"} has no ip or host, so there is no SSH command.`);
      } else if (targets.length === 1) {
        copy(targets[0]);
      } else {
        new SshPicker(plugin.app, targets, copy).open();
      }
      return;
    }
    case "open":
      await plugin.app.workspace.openLinkText(item.path, "", false);
      return;
  }
}
