import { TFile } from "obsidian";
import {
  createKeyRecord, decryptValue, encryptValue, isEncrypted, newRecoveryKey, rewrapPassword,
  unlockWithPassword, unlockWithRecovery, WrongSecretError, type KeyRecord, type Session,
} from "./keys";
import { KeyGuard } from "./session";
import { collectSecrets, mapSecrets } from "./transform";
import { askNewPassword, askUnlock, showRecoveryKey } from "../ui/encryption-modals";
import type InfraLedgerPlugin from "../main";

export interface BulkReport {
  notes: number;
  values: number;
  skipped: string[];
  failed: number;
}

/** Everything the plugin does with the master password, the data key and encrypted values. */
export class EncryptionController {
  readonly guard: KeyGuard;

  constructor(private readonly plugin: InfraLedgerPlugin) {
    this.guard = new KeyGuard(
      () => plugin.settings.autoLockMinutes,
      () => {
        plugin.notify("Infra Ledger locked.");
        plugin.index.trigger("changed", plugin.index.snapshot);
      },
    );
  }

  get record(): KeyRecord | undefined {
    return this.plugin.settings.encryption;
  }

  enabled(): boolean {
    return !!this.record;
  }

  unlocked(): boolean {
    return this.guard.session !== null;
  }

  /** The data key, asking for the password when locked. Null when encryption is off or the user cancels. */
  async session(): Promise<Session | null> {
    const record = this.record;
    if (!record) return null;
    if (this.guard.session) {
      this.guard.touch();
      return this.guard.session;
    }
    let recovered = false;
    const ok = await askUnlock(this.plugin.app, async ({ secret, recovery }) => {
      try {
        const s = recovery ? await unlockWithRecovery(record, secret) : await unlockWithPassword(record, secret);
        this.guard.unlock(s);
        recovered = recovery;
        return null;
      } catch (e) {
        if (e instanceof WrongSecretError) return recovery ? "That recovery key doesn't fit." : "Wrong password.";
        throw e;
      }
    });
    if (!ok) return null;
    this.plugin.index.trigger("changed", this.plugin.index.snapshot);
    if (recovered) {
      this.plugin.notify("Unlocked with the recovery key. Set a new master password.");
      await this.changePassword();
    }
    return this.guard.session;
  }

  /** Plaintext for display or copy. Null when the user doesn't unlock. */
  async reveal(value: string): Promise<string | null> {
    if (!isEncrypted(value)) return value;
    const s = await this.session();
    if (!s) return null;
    try {
      return await decryptValue(s, value);
    } catch {
      this.plugin.notify("This value was encrypted with a different key and can't be opened.");
      return null;
    }
  }

  /** Value to write for a new secret: encrypted when encryption is on. Null when the user doesn't unlock. */
  async seal(plain: string): Promise<string | null> {
    if (!this.enabled()) return plain;
    const s = await this.session();
    return s ? encryptValue(s, plain) : null;
  }

  async setUp(): Promise<void> {
    if (this.enabled()) return this.plugin.notify("Encryption is already set up.");
    const password = await askNewPassword(
      this.plugin.app,
      "Set up encryption",
      "Pick a master password. It encrypts the secret fields of your creds blocks. Hostnames, users and notes stay readable.",
    );
    if (!password) return;
    const { record, recoveryKey, session } = await createKeyRecord(password);
    await showRecoveryKey(this.plugin.app, recoveryKey, (k) => void this.plugin.copyText(k, "Recovery key copied. Paste it somewhere safe, then clear it."));
    this.plugin.settings.encryption = record;
    await this.plugin.saveSettings();
    this.guard.unlock(session);
    this.plugin.notify("Encryption is on. Run \"Encrypt all secrets\" to encrypt what is already in your notes.");
  }

  async changePassword(): Promise<void> {
    const record = this.record;
    if (!record) return;
    const s = await this.session();
    if (!s) return;
    const password = await askNewPassword(this.plugin.app, "New master password", "Your recovery key stays the same.");
    if (!password) return;
    this.plugin.settings.encryption = await rewrapPassword(record, s, password);
    await this.plugin.saveSettings();
    this.plugin.notify("Master password changed.");
  }

  async replaceRecoveryKey(): Promise<void> {
    const record = this.record;
    if (!record) return;
    const s = await this.session();
    if (!s) return;
    const next = await newRecoveryKey(record, s);
    await showRecoveryKey(this.plugin.app, next.recoveryKey, (k) => void this.plugin.copyText(k, "Recovery key copied."));
    this.plugin.settings.encryption = next.record;
    await this.plugin.saveSettings();
    this.plugin.notify("New recovery key saved. The old one no longer works.");
  }

  /** Counts secret and history values in the vault, by state. */
  counts(): { plain: number; encrypted: number } {
    let plain = 0;
    let encrypted = 0;
    for (const ic of this.plugin.index.snapshot.credentials) {
      for (const v of [ic.cred.secret, ...ic.cred.history.map((h) => h.secret)]) {
        if (v === undefined) continue;
        if (isEncrypted(v)) encrypted++;
        else plain++;
      }
    }
    return { plain, encrypted };
  }

  async turnOff(): Promise<void> {
    const { encrypted } = this.counts();
    if (encrypted > 0) {
      return this.plugin.notify(`${encrypted} values are still encrypted. Run "Decrypt all secrets" first.`);
    }
    this.guard.lock();
    delete this.plugin.settings.encryption;
    await this.plugin.saveSettings();
    this.plugin.notify("Encryption is off. Secrets are stored as plain text.");
  }

  encryptAll(): Promise<BulkReport | null> {
    return this.bulk((s, v) => (isEncrypted(v) ? null : encryptValue(s, v)));
  }

  decryptAll(): Promise<BulkReport | null> {
    return this.bulk((s, v) => (isEncrypted(v) ? decryptValue(s, v) : null));
  }

  /**
   * Rewrites secrets note by note. Values are computed first (crypto is async), then each note is
   * written in one vault.process call; a note that changed in between is skipped and reported.
   */
  private async bulk(convert: (s: Session, v: string) => Promise<string> | null): Promise<BulkReport | null> {
    const s = await this.session();
    if (!s) return null;
    const { vault } = this.plugin.app;
    const report: BulkReport = { notes: 0, values: 0, skipped: [], failed: 0 };
    const paths = [...new Set(this.plugin.index.snapshot.credentials.map((c) => c.path))];
    for (const path of paths) {
      const file = vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      const original = await vault.read(file);
      const map = new Map<string, string>();
      for (const v of new Set(collectSecrets(original))) {
        const next = convert(s, v);
        if (!next) continue;
        try {
          map.set(v, await next);
        } catch {
          report.failed++;
        }
      }
      if (map.size === 0) continue;
      let written = 0;
      await vault.process(file, (note) => {
        if (note !== original) {
          report.skipped.push(path);
          return note;
        }
        const r = mapSecrets(note, (v) => map.get(v));
        if (!r.ok) {
          report.skipped.push(path);
          return note;
        }
        written = r.changed;
        return r.note;
      });
      if (written > 0) {
        report.notes++;
        report.values += written;
        await this.plugin.index.refresh(file);
      }
    }
    this.guard.touch();
    return report;
  }
}
