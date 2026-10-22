import { App, Platform, SuggestModal } from "obsidian";
import { buildSearchItems, matchItems, type SearchItem } from "../util/search";
import { sshCommand } from "../util/ssh";
import type InfraLedgerPlugin from "../main";

type Action = "secret" | "user" | "ssh" | "open";

const ACTION_LABELS: Record<Action, string> = {
  secret: "Copy password",
  user: "Copy username",
  ssh: "Copy SSH command",
  open: "Open note",
};

export class SearchModal extends SuggestModal<SearchItem> {
  private readonly items: SearchItem[];

  constructor(app: App, private readonly plugin: InfraLedgerPlugin) {
    super(app);
    this.items = buildSearchItems(plugin.index.snapshot);
    this.setPlaceholder("Search resources and credentials");
    this.limit = 100;
    if (Platform.isMobile) return;
    this.setInstructions([
      { command: "↵", purpose: "copy password" },
      { command: "shift ↵", purpose: "copy username" },
      { command: Platform.isMacOS ? "cmd ↵" : "ctrl ↵", purpose: "copy SSH command" },
      { command: "alt ↵", purpose: "open note" },
    ]);
    this.scope.register(["Shift"], "Enter", (e) => this.runOnSelected(e, "user"));
    this.scope.register(["Mod"], "Enter", (e) => this.runOnSelected(e, "ssh"));
    this.scope.register(["Alt"], "Enter", (e) => this.runOnSelected(e, "open"));
  }

  override getSuggestions(query: string): SearchItem[] {
    if (this.items.length === 0) {
      this.emptyStateText = 'No resources yet. Run "Infra Ledger: New resource" to add your first server.';
      return [];
    }
    this.emptyStateText = `No match for "${query.trim()}". Try a host, tag or username.`;
    return matchItems(query, this.items);
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
    void run(this.plugin, item, item.kind === "resource" ? "open" : "secret");
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
    const r = this.item.resource;
    const actions: Action[] = [];
    if (c?.secret !== undefined) actions.push("secret");
    if (c?.user) actions.push("user");
    if (r && sshCommand(r, c?.user)) actions.push("ssh");
    actions.push("open");
    return actions;
  }

  override renderSuggestion(a: Action, el: HTMLElement): void {
    el.setText(ACTION_LABELS[a]);
  }

  override onChooseSuggestion(a: Action): void {
    this.pick(a);
  }
}

async function run(plugin: InfraLedgerPlugin, item: SearchItem, action: Action): Promise<void> {
  const cred = item.credential?.cred;
  const name = cred?.label ?? item.title;
  switch (action) {
    case "secret":
      if (cred?.secret !== undefined) await plugin.copySecret(cred.secret);
      else plugin.notify(`No password stored for ${name}.`);
      return;
    case "user":
      if (cred?.user) await plugin.copyUser(cred.user);
      else plugin.notify(`No username stored for ${name}.`);
      return;
    case "ssh": {
      const cmd = item.resource ? sshCommand(item.resource, cred?.user) : null;
      if (cmd) await plugin.copyText(cmd, `SSH command copied: ${cmd}`);
      else plugin.notify(`${item.resource?.name ?? "This note"} has no ip or host, so there is no SSH command.`);
      return;
    }
    case "open":
      await plugin.app.workspace.openLinkText(item.path, "", false);
      return;
  }
}
