import { App, FuzzySuggestModal } from "obsidian";
import type { Credential } from "../model";

/** Lets the user pick one credential of the current note for a command. */
export class CredentialPicker extends FuzzySuggestModal<Credential> {
  constructor(
    app: App,
    private readonly creds: Credential[],
    private readonly onPick: (cred: Credential) => void,
  ) {
    super(app);
    this.setPlaceholder("Pick a credential");
  }

  override getItems(): Credential[] {
    return this.creds;
  }

  override getItemText(c: Credential): string {
    return c.user ? `${c.label} (${c.user})` : c.label;
  }

  override onChooseItem(c: Credential): void {
    this.onPick(c);
  }
}
