import { App, Events, TAbstractFile, TFile } from "obsidian";
import { findCredsBlocks } from "../creds/locate";
import { parseCredsBlock } from "../creds/parse";
import { buildIndex, EMPTY_SNAPSHOT, type FileRecord, type LedgerSnapshot } from "./core";
import type { Space } from "../spaces";

const DEBOUNCE_MS = 300;

/** Keeps a snapshot of every resource and creds block in the vault. Emits "changed". */
export class LedgerIndex extends Events {
  snapshot: LedgerSnapshot = EMPTY_SNAPSHOT;
  private records = new Map<string, FileRecord>();
  private pending = new Set<string>();
  private timer: number | null = null;

  constructor(
    private readonly app: App,
    private readonly spaces: () => Space[],
  ) {
    super();
  }

  /** Re-assigns spaces after the settings change; no files are read. */
  reindexSpaces(): void {
    this.rebuild();
  }

  async scanAll(): Promise<void> {
    this.records.clear();
    const files = this.app.vault.getMarkdownFiles();
    await Promise.all(files.map((f) => this.readFile(f)));
    this.rebuild();
  }

  /** Wire vault and metadata events. Returns unsubscribe callbacks for the plugin to register. */
  watch(register: (ref: ReturnType<Events["on"]>) => void): void {
    register(this.app.metadataCache.on("changed", (file) => this.queue(file)));
    register(this.app.vault.on("create", (file) => this.queue(file)));
    register(this.app.vault.on("delete", (file) => this.remove(file.path)));
    register(
      this.app.vault.on("rename", (file, oldPath) => {
        this.remove(oldPath);
        this.queue(file);
      }),
    );
  }

  /** Re-reads one file right away, for use after the plugin writes to it. */
  async refresh(file: TFile): Promise<void> {
    await this.readFile(file);
    this.rebuild();
  }

  takenIds(): Set<string> {
    return new Set(this.snapshot.byId.keys());
  }

  dispose(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  private queue(file: TAbstractFile): void {
    if (!(file instanceof TFile) || file.extension !== "md") return;
    this.pending.add(file.path);
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.flush(), DEBOUNCE_MS);
  }

  private async flush(): Promise<void> {
    this.timer = null;
    const paths = [...this.pending];
    this.pending.clear();
    await Promise.all(
      paths.map(async (path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) await this.readFile(file);
        else this.records.delete(path);
      }),
    );
    this.rebuild();
  }

  private remove(path: string): void {
    if (this.records.delete(path)) this.rebuild();
  }

  private async readFile(file: TFile): Promise<void> {
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = (cache?.frontmatter as Record<string, unknown> | undefined) ?? null;
    const hasCode = cache?.sections?.some((s) => s.type === "code") ?? true;
    let blocks: FileRecord["blocks"] = [];
    if (hasCode) {
      // Sections give the position of code blocks but not their language, so read and check.
      const text = await this.app.vault.cachedRead(file);
      blocks = findCredsBlocks(text).map((b) => parseCredsBlock(b.content));
    }
    if (!frontmatter?.type && blocks.length === 0) {
      this.records.delete(file.path);
      return;
    }
    this.records.set(file.path, { path: file.path, basename: file.basename, frontmatter, blocks });
  }

  private rebuild(): void {
    const files = [...this.records.values()].sort((a, b) => a.path.localeCompare(b.path));
    this.snapshot = buildIndex(files, this.spaces().filter((s) => s.name !== ""));
    this.trigger("changed", this.snapshot);
  }
}
