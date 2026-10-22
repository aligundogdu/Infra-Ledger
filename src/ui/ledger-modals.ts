import { App, Modal, Setting, SuggestModal, TFile, moment } from "obsidian";
import { EVENTS, type EventKind } from "../ledger/parse";
import type InfraLedgerPlugin from "../main";

export interface PersonChoice {
  /** Value written to the note: "[[Link]]" for person notes, plain text otherwise. */
  value: string;
  display: string;
  hint: string;
}

/** People to suggest: person notes first, then names used before in assigned_to and the ledger. */
export function personChoices(plugin: InfraLedgerPlugin, sourcePath: string): PersonChoice[] {
  const { app } = plugin;
  const choices: PersonChoice[] = [];
  const seen = new Set<string>();
  const add = (c: PersonChoice) => {
    const key = c.display.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    choices.push(c);
  };
  for (const r of plugin.index.snapshot.resources) {
    if (r.type !== "person") continue;
    const file = app.vault.getAbstractFileByPath(r.path);
    const link = file instanceof TFile ? app.metadataCache.fileToLinktext(file, sourcePath) : r.name;
    add({ value: `[[${link}]]`, display: r.name, hint: "person note" });
  }
  for (const r of plugin.index.snapshot.resources) {
    if (r.assignedTo && !r.links.assigned_to) add({ value: r.assignedTo, display: r.assignedTo, hint: "used before" });
  }
  return choices;
}

class PersonPicker extends SuggestModal<PersonChoice> {
  constructor(
    app: App,
    private readonly choices: PersonChoice[],
    private readonly pick: (c: PersonChoice) => void,
  ) {
    super(app);
    this.setPlaceholder("Who gets it? Pick a person or type a name");
    this.emptyStateText = "Type a name to assign to someone without a person note.";
  }

  override getSuggestions(query: string): PersonChoice[] {
    const q = query.trim().toLowerCase();
    const matches = this.choices.filter((c) => c.display.toLowerCase().includes(q));
    if (q && !this.choices.some((c) => c.display.toLowerCase() === q)) {
      matches.push({ value: query.trim(), display: query.trim(), hint: "plain text, no person note" });
    }
    return matches;
  }

  override renderSuggestion(c: PersonChoice, el: HTMLElement): void {
    el.createDiv({ text: c.display });
    el.createDiv({ cls: "infra-ledger-suggestion-meta", text: c.hint });
  }

  override onChooseSuggestion(c: PersonChoice): void {
    this.pick(c);
  }
}

class NoteModal extends Modal {
  private note = "";

  constructor(
    app: App,
    private readonly heading: string,
    private readonly action: string,
    private readonly placeholder: string,
    private readonly submit: (note: string) => Promise<boolean>,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.titleEl.setText(this.heading);
    new Setting(this.contentEl).setName("Note").addText((t) => {
      t.setPlaceholder(this.placeholder);
      t.onChange((v) => (this.note = v.trim()));
      t.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") void this.done();
      });
      window.setTimeout(() => t.inputEl.focus(), 0);
    });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) => b.setButtonText(this.action).setCta().onClick(() => void this.done()));
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private async done(): Promise<void> {
    if (await this.submit(this.note)) this.close();
  }
}

export function openAssignFlow(plugin: InfraLedgerPlugin, path: string): void {
  new PersonPicker(plugin.app, personChoices(plugin, path), (person) => {
    new NoteModal(plugin.app, `Assign to ${person.display}`, "Assign", "Optional, e.g. new hire, charger included", (note) =>
      plugin.assign(path, person.value, person.display, note || undefined),
    ).open();
  }).open();
}

export function openReturnFlow(plugin: InfraLedgerPlugin, path: string, holder: string): void {
  new NoteModal(plugin.app, `Return from ${holder}`, "Return", "Optional, e.g. left the company, scratch on lid", (note) =>
    plugin.returnDevice(path, note || undefined),
  ).open();
}

export class AddEventModal extends Modal {
  private event: EventKind = "service";
  private date = moment().format("YYYY-MM-DD");
  private note = "";

  constructor(app: App, private readonly plugin: InfraLedgerPlugin, private readonly path: string) {
    super(app);
  }

  override onOpen(): void {
    this.titleEl.setText("Add event");
    new Setting(this.contentEl).setName("Event").addDropdown((d) => {
      for (const e of EVENTS) if (e !== "assigned" && e !== "returned") d.addOption(e, e);
      d.setValue(this.event).onChange((v) => (this.event = v as EventKind));
    });
    new Setting(this.contentEl)
      .setName("Date")
      .addText((t) => {
        t.inputEl.type = "date";
        t.setValue(this.date).onChange((v) => (this.date = v));
      });
    new Setting(this.contentEl).setName("Note").addText((t) => {
      t.setPlaceholder("e.g. battery replaced, Apple Store");
      t.onChange((v) => (this.note = v.trim()));
      window.setTimeout(() => t.inputEl.focus(), 0);
    });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) => b.setButtonText("Add event").setCta().onClick(() => void this.save()));
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private async save(): Promise<void> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.date)) {
      this.plugin.notify("Pick a date.");
      return;
    }
    const added = await this.plugin.addEvent(this.path, {
      date: this.date,
      event: this.event,
      ...(this.note && { note: this.note }),
    });
    if (added) this.close();
  }
}
