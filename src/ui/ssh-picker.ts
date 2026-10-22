import { App, SuggestModal } from "obsidian";
import type { SshTarget } from "../util/ssh";

/** Lets the user pick which address an SSH command should use. */
export class SshPicker extends SuggestModal<SshTarget> {
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
