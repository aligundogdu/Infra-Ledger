# Infra Ledger: Brand

This file is the single source for brand decisions. Color and font values live in `brand.yaml`, logos in `logo/`. Open `brandbook.html` in a browser for the visual overview.

## 1. Positioning

**What:** An Obsidian plugin that keeps server, database, cloud account and service details in your notes, and records every password change with its date.

**For whom:** People who run many servers alone or with a small team. Freelance developers, agency owners, homelab users, the one technical person at a small company who looks after everything. People who don't want to set up Bitwarden or 1Password, already keep this data in Markdown, and are tired of the mess.

**What it is not:** A password manager. No browser autofill, no server, no team sharing. We say this plainly, because a wrong expectation breaks trust.

**Difference:** Data stays in your vault as plain Markdown. Notes stay readable even if the plugin is removed. A password's history, with the date and the reason it changed, lives inside the note.

**Positioning statement:**
> For people who run their own servers and keep notes in Obsidian, Infra Ledger turns scattered credentials into a searchable inventory with a history of every change, stored as plain Markdown you can read without the plugin.

## 2. Name and idea

A ledger is an accounting book. Entries are never erased: a line is struck through and the new one is written below it. The plugin's password history works the same way. The old value doesn't disappear, it moves down into history with its date.

The visual language comes from this idea:
- **Bars:** units in a server rack and lines in a ledger. The top bar is full color, the current entry. The bars below fade, they are past entries.
- **Red vertical line:** the margin rule of an accounting ledger. It separates the entry from the note.
- **Green dot:** a server's status LED. This entry is current.

## 3. Logo

| File | Use |
|---|---|
| `logo/logo.svg` | Full logo on light backgrounds (README header, slides) |
| `logo/logo-dark.svg` | Full logo on dark backgrounds |
| `logo/mark.svg` | Mark only, light background |
| `logo/mark-dark.svg` | Mark only, dark background |
| `logo/app-icon.svg` | Square icon on paper background (GitHub social preview, avatar) |
| `logo/ribbon-icon.svg` | Obsidian ribbon and command icon, `currentColor`, single color |

Rules:
- The mark's proportions and the bar opacity order (100 / 50 / 22) don't change. The order means "current on top, history below".
- Below 24px, use `ribbon-icon.svg`. The full-color mark is unreadable below 32px.
- Keep clear space of at least one bar height around the logo.
- No shadows, gradients or frames. No colors outside the palette.
- In the wordmark, "Infra" is regular and "Ledger" is semibold. Always two words, never "InfraLedger" or "Infra-Ledger". In code: `infra-ledger`.
- The text in `logo.svg` is still live font text. Convert it to paths in Figma or Inkscape before release.

## 4. Color

| Role | Light | Dark | Used for |
|---|---|---|---|
| Ink | `#15191E` | `#F3F0E7` | Text, logo bars |
| Paper | `#F3F0E7` | `#101317` | Background |
| Ledger green | `#2D6A4F` | `#5FB58A` | Primary: links, buttons, "current" state |
| Margin red | `#B8432F` | `#E07A5F` | Change and history marker, margin rule |
| Rule | `#D9D3C3` | `#2A2F36` | Dividers and table lines |
| Muted | `#5B6168` | `#9AA1A9` | Secondary text, dates, labels |

Rules:
- Red is not the error color, it is the "changed" color. Errors use Obsidian's own `--text-error`. This keeps "password changed" and "something broke" apart.
- Green and red never carry meaning on their own (color blindness). There is always an icon or text next to them.
- Every text combination passes WCAG AA (ratios in `brand.yaml`).

**Inside the plugin UI:** use Obsidian's theme variables (`--background-primary`, `--text-normal`, `--interactive-accent` etc.). Brand colors appear only in the icon, the history marker (a thin margin-red left border) and empty-state illustrations. The plugin never fights the user's theme.

## 5. Typography

- **IBM Plex Sans:** headings (600) and body (400). Reads like good technical documentation without feeling cold.
- **IBM Plex Mono:** data. IPs, usernames, credential ids, SSH commands, dates. The rule is simple: anything you can copy is set in mono.
- The plugin loads no custom fonts. The UI uses Obsidian's font, data fields use the `--font-monospace` variable.

## 6. Voice and tone

Infra Ledger talks like a note from one person who runs servers to another. Short, factual, says what happened.

**Principles:**
1. **Say what happened, not how it feels.** "Password changed. Previous value moved to history." No "Great!" or "Success!".
2. **Use numbers and names.** "Clipboard clears in 30 s", "Duplicate id `forge-key` in `HomeServer.md` and `Forge.md`". Never "Some items have issues".
3. **Don't oversell security.** Never imply the plugin protects something it doesn't. If encryption is off, say so.
4. **Error messages state the next step.** "Can't save: YAML error on line 4. Fix it in source mode, then try again."
5. **Don't blame the user.** Not "You entered an invalid...", but "This block has a YAML error...".

**Address:** "you". Contractions are fine ("can't", "don't").

**Use:**
- "credentials", "resource", "history", "rotate", "copy", "vault"
- "plain Markdown", "readable without the plugin"
- "optional encryption"

**Avoid:**
- Security hype: "military-grade", "bank-level", "unhackable", "100% secure", "zero risk"
- Empty adjectives: "powerful", "seamless", "effortless", "robust", "revolutionary", "next-gen", "ultimate"
- AI-sounding filler: "leverage", "streamline", "empower", "supercharge", "elevate", "delve", "harness"
- Exclamation marks (including in success and error messages), emoji
- Calling itself a "password manager"

## 7. Honest security statement

The same text appears in the README, the settings screen and the encryption setup:

> Infra Ledger stores everything in your vault as plain Markdown. If your vault syncs to iCloud, Dropbox or Git, your credentials go with it. Optional encryption protects the `secret` fields with a master password. Hostnames, users and notes stay readable so you can search them.

## 8. Copy library

**Tagline:** Credentials with a paper trail.

**GitHub description:**
Keep server, database and cloud credentials in your Obsidian notes, with per-credential password history, fast search and copy, and optional encryption.

**GitHub topics:** obsidian-plugin, obsidian, sysadmin, homelab, devops, credentials, password-history, inventory, markdown

**manifest.json description** (shown in the community plugin browser):
Track servers, databases and cloud accounts in your notes. Keep a history of every password change, search and copy credentials fast, optionally encrypt secrets.

**README intro:**
> Infra Ledger keeps your servers, databases and cloud accounts as notes in your vault. Each note holds a `creds` block with the users and passwords for that resource. When you rotate a password, the old one moves to a dated history with the reason you gave. Search across everything from the command palette and copy a password, a username or a ready SSH command with one key.

**UI microcopy:**

| Situation | Text |
|---|---|
| Password copied | Password copied. Clipboard clears in 30 s. |
| Username copied | Username copied. |
| SSH command copied | SSH command copied: `ssh -p 22 deploy@192.168.1.10` |
| Password changed | Password changed. Previous value moved to history. |
| Empty history | No previous passwords yet. |
| YAML error | Can't read this block: YAML error on line 4. Fix it in source mode. |
| Write rejected | Can't save: the block changed since you opened this. Reopen and try again. |
| Duplicate id | Duplicate id `forge-key` in `HomeServer.md` and `Forge.md`. Rename one before editing. |
| Unresolved ref | No credential with id `forge-key`. Check the spelling or define it in a resource note. |
| Empty search | No match for "prod pg". Try a host, tag or username. |
| No resources | No resources yet. Run "Infra Ledger: New resource" to add your first server. |
| Change reason placeholder | Why? (optional) e.g. rotation, employee left, leaked |

**Command names:** "Search", "New resource", "Change password", "Show history". Each starts with a verb and does one thing.

## 9. Naming

- Product: **Infra Ledger** (two words, both capitalized)
- Plugin id and CSS prefix: `infra-ledger`, `.infra-ledger-*`
- Code block: ` ```creds `
- Concepts: **resource** (server, database, cloud account, service), **credential** (user + secret), **history** (previous secrets), **ref** (a reference to a credential defined in another resource)
