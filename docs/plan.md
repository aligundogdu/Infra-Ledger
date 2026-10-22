# Infra Ledger v1 Implementation Plan

**Goal:** Ship v1 of the Infra Ledger Obsidian plugin as described in `docs/design.md`.

**Architecture:** Pure, Obsidian-free modules (`src/creds`, `src/util`, `src/index/core.ts`) hold all parsing, mutation and indexing logic and are covered by vitest. Thin Obsidian adapters (`src/main.ts`, `src/index/ledger-index.ts`, `src/ui/*`) wire them to the vault, the code block processor, commands and modals.

**Tech stack:** TypeScript 5, esbuild, vitest, `yaml` 2.x (Document API, YAML 1.2 core schema), Obsidian API (`obsidian` npm types).

**Spec:** `docs/design.md`.

**Status (2026-10-22):** phases 0-11 done; 0.2 (spaces, network block) and 0.3 (devices, ledger) built on top, see the spec. **Brand and copy:** `brand/brand.md`.

## Global constraints

- Plugin id `infra-ledger`, name `Infra Ledger`, code block language `creds`.
- `isDesktopOnly: false`, `minAppVersion: 1.4.10`. No Node APIs in `src/`; crypto through Web Crypto only.
- Core fields (`id, label, user, secret, kind, note, ref, reason`) are always strings read from raw source text, never from YAML-coerced values.
- Writes go through `vault.process()`. Only the target `creds` block's content may change; every other byte of the note stays identical.
- Plugin writes `secret` values double-quoted.
- UI copy follows `brand/brand.md` section 6 and 8: no exclamation marks, no emoji, numbers and names in messages, errors state the next step.
- CSS classes use the `infra-ledger-` prefix and Obsidian theme variables.
- Every phase ends with `npm test` and `npm run build` passing, then commit and push.
- No AI or tool attribution anywhere in the repo or commit messages.

## File map

```
manifest.json, versions.json, package.json, tsconfig.json, esbuild.config.mjs, vitest.config.ts
styles.css
src/
  main.ts                    plugin entry: settings, index, processor, commands
  settings.ts                InfraLedgerSettings, DEFAULT_SETTINGS, settings tab
  model.ts                   shared types
  creds/parse.ts             parseCredsBlock(text): ParseResult
  creds/raw-scalar.ts        readRawString(node, src): string | null
  creds/locate.ts            findCredsBlocks(note), findBlockWithId(note, id)
  creds/mutate.ts            changeSecret, addCredential, deleteCredential, deleteHistoryEntry
  index/core.ts              buildIndex(files): LedgerSnapshot (duplicates, refs, sync copies)
  index/ledger-index.ts      Obsidian adapter: scan, watch, debounce, query
  util/generator.ts          generatePassword(opts)
  util/ssh.ts                sshCommand(resource, cred)
  util/clipboard.ts          ClipboardGuard (copy + timed clear)
  util/search.ts             buildSearchItems(snapshot), matchItems(query, items)
  util/ids.ts                suggestId(resourceName, label, taken)
  ui/block-view.ts           code block renderer
  ui/change-modal.ts         change password
  ui/history-modal.ts        history list, delete entry
  ui/credential-modal.ts     add credential, delete confirm
  ui/search-modal.ts         quick search + mobile action menu
  ui/new-resource.ts         new resource flow and templates
  ui/confirm-modal.ts        reusable confirm dialog
tests/                       vitest specs mirroring src/
```

---

## Phase 0: Repository foundation

**Deliverable:** README with badges, LICENSE (MIT), `.gitignore`, spec, plan and brand committed and pushed.

- [ ] README following `brand/brand.md` copy library: logo, tagline, badges, intro, features, the `creds` format, commands and shortcuts, security statement, install (manual + BRAT until listed), development, license.
- [ ] Badges (shields.io, no tokens needed): CI status, latest release, license, Obsidian min version, "platform: desktop + mobile". Downloads badge added after the plugin is listed.
- [ ] `.gitignore`: `node_modules/`, `main.js`, `*.map`, `.DS_Store`, `coverage/`, `data.json`.
- [ ] Set GitHub description and topics with `gh repo edit`.
- [ ] Commit `docs: add readme, license, design, plan and brand` and push.

## Phase 1: Scaffold and CI

**Files:** `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `vitest.config.ts`, `manifest.json`, `versions.json`, `src/main.ts`, `styles.css`, `.github/workflows/ci.yml`, `tests/smoke.test.ts`

- [ ] `package.json` scripts: `dev` (esbuild watch), `build` (`tsc --noEmit && node esbuild.config.mjs production`), `test` (`vitest run`), `lint` (`tsc --noEmit`).
- [ ] Dev deps: `obsidian`, `typescript@5`, `esbuild`, `vitest`, `@types/node` (build scripts only). Runtime dep: `yaml`.
- [ ] esbuild bundles `src/main.ts` to `main.js`, cjs, `external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"]`, target es2020.
- [ ] `manifest.json` with id, name, version `0.1.0`, `minAppVersion: 1.4.10`, description from `brand/brand.md`, author, `isDesktopOnly: false`.
- [ ] Minimal `main.ts` that loads and unloads.
- [ ] CI workflow: `npm ci`, `npm test`, `npm run build` on push and PR.
- [ ] Smoke test passes, build produces `main.js`. Commit `chore: scaffold plugin, build and ci`, push.

## Phase 2: Model and parser

**Files:** `src/model.ts`, `src/creds/raw-scalar.ts`, `src/creds/parse.ts`, `tests/creds/parse.test.ts`

**Produces:**
```ts
type Kind = "ssh" | "db" | "panel" | "api-key" | "other";
interface HistoryEntry { secret: string; until: string; reason?: string }
interface Credential { type: "credential"; id: string; label: string; user?: string; secret?: string;
  kind: Kind; note?: string; updated?: string; history: HistoryEntry[]; index: number }
interface CredRef { type: "ref"; ref: string; index: number }
type Entry = Credential | CredRef;
interface BlockIssue { level: "error" | "warning"; code: IssueCode; message: string; line?: number; index?: number }
type IssueCode = "yaml" | "not-a-list" | "missing-id" | "missing-label" | "invalid-field" | "invalid-ref" | "invalid-entry";
interface ParseResult { entries: Entry[]; issues: BlockIssue[]; ok: boolean }  // ok=false only for errors
function parseCredsBlock(text: string): ParseResult;
```

Tests (write first, then implement):
- [ ] Valid block with two credentials and one ref returns three entries in order.
- [ ] Empty block and comment-only block return 0 entries, `ok: true`.
- [ ] Broken YAML returns `ok: false` with a `yaml` issue carrying a 1-based line.
- [ ] Top-level map instead of list returns `not-a-list` error.
- [ ] Raw reading: `secret: 0xdeadbeef`, `0123456`, `1e10`, `null`, `~`, `true`, `updated: 2026-10-22` come back as exactly those strings.
- [ ] Quoted values unescape normally (`"a\"b"` returns `a"b`).
- [ ] Missing `id` or `label` gives a warning and the entry is skipped.
- [ ] Map or list in a core field gives `invalid-field` warning, entry kept with that field undefined.
- [ ] `ref` with extra fields gives `invalid-ref` warning.
- [ ] Unknown `kind` falls back to `other`; unknown fields are ignored by the parser (kept by mutate).
- [ ] History entries parse with raw secrets; history order is preserved.
- [ ] Commit `feat: parse creds blocks with raw scalar reading`, push.

## Phase 3: Locate and mutate

**Files:** `src/creds/locate.ts`, `src/creds/mutate.ts`, `tests/creds/locate.test.ts`, `tests/creds/mutate.test.ts`

**Produces:**
```ts
interface BlockLocation { start: number; end: number; contentStart: number; contentEnd: number; content: string }
function findCredsBlocks(note: string): BlockLocation[];          // ```creds and ~~~creds fences
function findBlockWithId(note: string, id: string): BlockLocation | null;
type MutateResult = { ok: true; note: string } | { ok: false; reason: string };
function changeSecret(note: string, id: string, newSecret: string, today: string, reason?: string): MutateResult;
function addCredential(note: string, cred: NewCredential): MutateResult;   // appends to first creds block or creates one
function deleteCredential(note: string, id: string): MutateResult;
function deleteHistoryEntry(note: string, id: string, historyIndex: number): MutateResult;
interface NewCredential { id: string; label: string; user?: string; secret?: string; kind?: Kind; note?: string }
```

Tests:
- [ ] `findCredsBlocks` finds multiple blocks, ignores other languages, handles `~~~` and fences with trailing spaces, ignores unterminated fence.
- [ ] `changeSecret` moves the old secret to the top of `history` with `until` and `reason`, sets new double-quoted secret and `updated`.
- [ ] Bytes before and after the target block are identical (`note.slice(0, start)` and `note.slice(end)` compared).
- [ ] Comments inside the block and unknown fields survive.
- [ ] Note with two creds blocks: only the block holding the id changes.
- [ ] A raw unquoted secret like `0123456` moves to history as `"0123456"`.
- [ ] Ref entries are never modified; id not found returns `ok: false`.
- [ ] `addCredential` into empty block, into block with entries, into note without any block (appends a new block at the end).
- [ ] `deleteCredential` removes entry with its history; `deleteHistoryEntry` removes one row.
- [ ] Unparseable block returns `ok: false` and the note is unchanged.
- [ ] Commit `feat: locate and mutate creds blocks`, push.

## Phase 4: Utilities

**Files:** `src/util/generator.ts`, `src/util/ssh.ts`, `src/util/clipboard.ts`, `src/util/ids.ts`, tests for each.

**Produces:**
```ts
interface GeneratorOptions { length: number; symbols: boolean; excludeAmbiguous: boolean }
function generatePassword(opts: GeneratorOptions, rand?: (n: number) => Uint32Array): string;
function sshCommand(r: { ip?: string; host?: string; sshPort?: number }, user?: string): string | null;
interface ClipboardLike { writeText(t: string): Promise<void>; readText?(): Promise<string> }
class ClipboardGuard { constructor(cb: ClipboardLike, timers?: TimerLike); copy(text: string, clearAfterSec: number, sensitive: boolean): Promise<void>; dispose(): void }
function suggestId(resourceName: string, label: string, taken: Set<string>): string;
```

Tests:
- [ ] Generator: exact length, only allowed characters, ambiguous `0O1lI|` excluded when set, at least one char from each enabled class, uses Web Crypto by default.
- [ ] SSH: `ssh -p 22 deploy@10.0.0.4`, prefers ip over host, default port 22, null without ip and host, user omitted when missing.
- [ ] Clipboard: clears after N seconds if clipboard still holds the value, leaves it if changed, clears unconditionally when `readText` throws or is missing, 0 disables, a new copy cancels the previous timer.
- [ ] `suggestId`: slugifies (`HomeServer`, `postgres app` gives `homeserver-postgres-app`), Turkish characters folded, suffix `-2`, `-3` on collision.
- [ ] Commit `feat: password generator, ssh command, clipboard guard, id suggestion`, push.

## Phase 5: Index

**Files:** `src/index/core.ts`, `src/index/ledger-index.ts`, `tests/index/core.test.ts`

**Produces:**
```ts
interface FileRecord { path: string; basename: string; frontmatter: Record<string, unknown> | null; blocks: ParseResult[] }
interface Resource { path: string; name: string; type: ResourceType; ip?: string; host?: string; url?: string;
  provider?: string; env?: string; sshPort: number; tags: string[] }
type ResourceType = "server" | "database" | "cloud" | "service" | "other";
interface IndexedCredential { cred: Credential; path: string; resource: Resource | null; duplicate: boolean }
interface IndexedRef { ref: CredRef; path: string; status: "ok" | "unresolved" | "ambiguous"; target?: IndexedCredential }
interface SyncCopyHint { copyPath: string; originalPath: string }
interface LedgerSnapshot { resources: Resource[]; credentials: IndexedCredential[]; refs: IndexedRef[];
  byId: Map<string, IndexedCredential[]>; issues: Map<string, BlockIssue[]>; syncCopies: SyncCopyHint[] }
function buildIndex(files: FileRecord[]): LedgerSnapshot;
function resourceFromFrontmatter(path: string, basename: string, fm: Record<string, unknown> | null): Resource | null;
class LedgerIndex extends Events { snapshot: LedgerSnapshot; onload(); rescan(file: TFile); on("changed", cb) }
```

Tests:
- [ ] Note with `type: server` becomes a resource; unknown type becomes `other`; no type gives `resource: null` (orphan credentials still indexed).
- [ ] `ssh_port` non-integer falls back to 22; `tags` as string or list normalizes to list.
- [ ] Same id in two files marks both `duplicate: true`.
- [ ] Ref resolution: ok, unresolved, ambiguous (target duplicated).
- [ ] Sync copy: file whose every id also exists in exactly one other file yields a hint; partial overlap yields none.
- [ ] Adapter (manual): scans on layout ready, re-indexes on modify/rename/delete with 300 ms debounce, emits `changed`.
- [ ] Commit `feat: vault index with duplicates, refs and sync copy hints`, push.

## Phase 6: Settings and block view

**Files:** `src/settings.ts`, `src/ui/block-view.ts`, `styles.css`, `src/main.ts`

```ts
interface InfraLedgerSettings { resourceFolder: string; clipboardClearSec: number; revealSec: number;
  generator: GeneratorOptions }
const DEFAULT_SETTINGS = { resourceFolder: "Infra", clipboardClearSec: 30, revealSec: 10,
  generator: { length: 24, symbols: true, excludeAmbiguous: true } };
```

- [ ] Settings tab with the four settings and the two clipboard notes from the spec in the description; honest security statement at the top.
- [ ] Block renderer: table (label, user, kind, masked secret, actions). Actions: reveal (auto re-mask after `revealSec`), copy user, copy secret, change password, history, delete. Changed rows (`updated` present) get the margin marker and "changed YYYY-MM-DD".
- [ ] Ref rows show target data and a link to its note; unresolved and ambiguous rows show the warning text from `brand/brand.md`, copy disabled for ambiguous.
- [ ] Parse error shows error box with line and the copy "Can't read this block: YAML error on line N. Fix it in source mode."; write actions hidden.
- [ ] Duplicate rows show the duplicate notice and disable write actions; sync copy hint Notice once per pair.
- [ ] Renderer re-renders on index `changed`.
- [ ] Manual check in a test vault (light and dark theme, mobile width). Commit `feat: settings and creds block view`, push.

## Phase 7: Change password and history

**Files:** `src/ui/change-modal.ts`, `src/ui/history-modal.ts`, `src/ui/confirm-modal.ts`

- [ ] Change modal: new secret input (masked with reveal toggle), Generate button, reason input with placeholder "Why? (optional) e.g. rotation, employee left, leaked". Save calls `vault.process(file, note => changeSecret(...))`; on `ok: false` keep note unchanged and show the Notice from the copy library.
- [ ] History modal: rows newest first, masked secret with reveal and copy (through ClipboardGuard), until date, reason, delete with confirm. Empty state "No previous passwords yet."
- [ ] Commit `feat: change password and history modals`, push.

## Phase 8: Add and delete credentials

**Files:** `src/ui/credential-modal.ts`, `src/main.ts`

- [ ] "Add credential" button under each block and command "Add credential to current note". Fields: label (required), user, secret + Generate, kind dropdown, note, id (prefilled with `suggestId`, editable). Reject when id exists in index.
- [ ] Delete action with confirm: "Delete <label> and its N previous passwords?". Rejected for duplicate ids.
- [ ] Commit `feat: add and delete credentials`, push.

## Phase 9: Quick search

**Files:** `src/util/search.ts`, `tests/util/search.test.ts`, `src/ui/search-modal.ts`

```ts
interface SearchItem { kind: "credential" | "resource"; title: string; subtitle: string; haystack: string;
  credential?: IndexedCredential; resource?: Resource | null; path: string }
function buildSearchItems(s: LedgerSnapshot): SearchItem[];
function matchItems(query: string, items: SearchItem[]): SearchItem[];  // all tokens must match, ranked
```

- [ ] Tests: every token must match somewhere in haystack, ranking prefers title matches, orphan items use file name, resources without credentials appear.
- [ ] Modal on `SuggestModal`: Enter copy secret, Shift+Enter copy user, Mod+Enter copy SSH command, Alt+Enter open note. Instructions row on desktop. On mobile, choosing a result opens an action menu with the same four actions.
- [ ] Empty result text: `No match for "<query>". Try a host, tag or username.`
- [ ] Commit `feat: quick search`, push.

## Phase 10: New resource

**Files:** `src/ui/new-resource.ts`

- [ ] Command "New resource": type picker (server, database, cloud, service, other), name input, creates `<resourceFolder>/<name>.md` with type-specific frontmatter skeleton and an empty `creds` block, opens it. Refuses to overwrite an existing file.
- [ ] Ribbon icon from `brand/logo/ribbon-icon.svg` opens search.
- [ ] Commit `feat: new resource command and ribbon icon`, push.

## Phase 11: Release preparation

- [ ] Release workflow on tag: build, attach `main.js`, `manifest.json`, `styles.css` to a GitHub release.
- [ ] `version-bump.mjs` keeps `manifest.json` and `versions.json` in sync.
- [ ] README: screenshots or GIF, BRAT install, full manual test checklist from the spec run on desktop and mobile.
- [ ] Tag `0.1.0`. Commit `chore: release workflow`, push.
