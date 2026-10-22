import { App, Modal, Setting } from "obsidian";
import { SCOPES, type NetAddress, type NetPort, type Scope } from "../network/parse";
import type { NetworkEntryRef, NewAddress, NewPort } from "../network/mutate";
import type InfraLedgerPlugin from "../main";

/** An ip has digits and dots (optional /cidr) or contains a colon (IPv6); anything else is a host name. */
export function isIpLike(value: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(value) || value.includes(":");
}

abstract class FormModal extends Modal {
  protected fields: Record<string, string> = {};

  constructor(
    app: App,
    protected readonly plugin: InfraLedgerPlugin,
    protected readonly path: string,
    /** Set when editing an existing entry. */
    protected readonly ref?: NetworkEntryRef,
  ) {
    super(app);
  }

  protected text(name: string, key: string, opts: { desc?: string; placeholder?: string; mono?: boolean; focus?: boolean } = {}) {
    const s = new Setting(this.contentEl).setName(name).addText((t) => {
      if (this.fields[key]) t.setValue(this.fields[key]);
      if (opts.placeholder) t.setPlaceholder(opts.placeholder);
      if (opts.mono) t.inputEl.addClass("infra-ledger-mono");
      t.onChange((v) => (this.fields[key] = v.trim()));
      t.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") void this.save();
      });
      if (opts.focus) window.setTimeout(() => t.inputEl.focus(), 0);
    });
    if (opts.desc) s.setDesc(opts.desc);
  }

  protected buttons(saveText: string): void {
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) => b.setButtonText(saveText).setCta().onClick(() => void this.save()));
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  protected abstract save(): Promise<void>;
}

export class AddressModal extends FormModal {
  private scopeChoice: Scope | "auto" = "auto";

  constructor(app: App, plugin: InfraLedgerPlugin, path: string, existing?: { ref: NetworkEntryRef; entry: NetAddress }) {
    super(app, plugin, path, existing?.ref);
    const a = existing?.entry;
    if (!a) return;
    this.fields.address = a.cidr ? `${a.value}/${a.cidr}` : a.value;
    for (const key of ["label", "iface", "mac", "gateway", "vlan", "note"] as const) if (a[key]) this.fields[key] = a[key]!;
    if (!a.scopeGuessed) this.scopeChoice = a.scope;
  }

  override onOpen(): void {
    this.titleEl.setText(this.ref ? "Edit address" : "Add address");
    this.text("IP or host", "address", { placeholder: "10.0.0.4/24 or box.example.com", mono: true, focus: true });
    new Setting(this.contentEl)
      .setName("Scope")
      .setDesc("Auto picks private for 10.x, 172.16-31.x, 192.168.x and vpn for 100.64.x (Tailscale).")
      .addDropdown((d) => {
        d.addOption("auto", "auto");
        for (const s of SCOPES) d.addOption(s, s);
        d.setValue(this.scopeChoice).onChange((v) => (this.scopeChoice = v as Scope | "auto"));
      });
    this.text("Label", "label", { placeholder: "main, vswitch, tailscale" });
    this.text("Interface", "iface", { placeholder: "eth0", mono: true });
    this.text("MAC", "mac", { mono: true });
    this.text("Gateway", "gateway", { mono: true });
    this.text("VLAN", "vlan", { mono: true });
    this.text("Note", "note");
    this.buttons(this.ref ? "Save" : "Add address");
  }

  protected async save(): Promise<void> {
    const address = this.fields.address ?? "";
    if (!address || /\s/.test(address)) {
      this.plugin.notify("Enter one ip or host name, e.g. 10.0.0.4 or box.example.com.");
      return;
    }
    const entry: NewAddress = isIpLike(address) ? { ip: address } : { host: address };
    if (this.scopeChoice !== "auto") entry.scope = this.scopeChoice;
    for (const key of ["label", "iface", "mac", "gateway", "vlan", "note"] as const) {
      if (this.fields[key]) entry[key] = this.fields[key];
    }
    const saved = this.ref
      ? await this.plugin.updateNetworkEntry(this.path, this.ref, entry, address)
      : await this.plugin.addNetworkEntry(this.path, entry, address);
    if (saved) this.close();
  }
}

export class PortModal extends FormModal {
  private proto: "tcp" | "udp" = "tcp";

  constructor(app: App, plugin: InfraLedgerPlugin, path: string, existing?: { ref: NetworkEntryRef; entry: NetPort }) {
    super(app, plugin, path, existing?.ref);
    const p = existing?.entry;
    if (!p) return;
    this.fields.port = String(p.port);
    this.proto = p.proto;
    if (p.service) this.fields.service = p.service;
    if (p.note) this.fields.note = p.note;
  }

  override onOpen(): void {
    this.titleEl.setText(this.ref ? "Edit port" : "Add port");
    this.text("Port", "port", { placeholder: "5432", mono: true, focus: true });
    new Setting(this.contentEl).setName("Protocol").addDropdown((d) => {
      d.addOption("tcp", "tcp").addOption("udp", "udp");
      d.setValue(this.proto).onChange((v) => (this.proto = v as "tcp" | "udp"));
    });
    this.text("Service", "service", { placeholder: "postgres" });
    this.text("Note", "note", { placeholder: "private network only" });
    this.buttons(this.ref ? "Save" : "Add port");
  }

  protected async save(): Promise<void> {
    const port = Number(this.fields.port);
    if (!/^\d+$/.test(this.fields.port ?? "") || port < 1 || port > 65535) {
      this.plugin.notify("Enter a port between 1 and 65535.");
      return;
    }
    const entry: NewPort = { port };
    if (this.proto === "udp") entry.proto = "udp";
    if (this.fields.service) entry.service = this.fields.service;
    if (this.fields.note) entry.note = this.fields.note;
    const saved = this.ref
      ? await this.plugin.updateNetworkEntry(this.path, this.ref, entry, `port ${port}`)
      : await this.plugin.addNetworkEntry(this.path, entry, `port ${port}`);
    if (saved) this.close();
  }
}
