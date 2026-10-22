# Manual test checklist

Unit tests cover parsing, mutation, indexing, search and utilities (`npm test`). The UI needs a manual pass in Obsidian before each release.

## Setup

```bash
npm run vault
```

Open `test-vault/` as a vault in Obsidian (Open another vault → Open folder as vault), then enable **Infra Ledger** in Settings → Community plugins.

## Desktop

- [ ] `Infra/HomeServer.md` in reading view: table with root, postgres app and the Forge ref. Secrets masked.
- [ ] Root row has the red margin line and "changed 2026-10-22".
- [ ] Eye button reveals a secret and masks it again after 10 s.
- [ ] Copy secret: Notice "Password copied. Clipboard clears in 30 s.", clipboard empty after 30 s.
- [ ] Copy secret, then copy something else within 30 s: the other value survives.
- [ ] postgres app shows `0123456` when revealed (not `123456`). Prod DB admin shows `0xdeadbeef`.
- [ ] Forge ref row shows "from Forge.md", link opens Forge.
- [ ] Prod DB `missing-id` ref shows "No credential with id ...".
- [ ] `HomeServer 2.md` triggers the sync copy Notice once. Both files show the duplicate notice for `homeserver-root`; change password on it is refused, copy still works.
- [ ] Change password on postgres app (in `Prod DB`), with Generate and a reason. Old value moves to history, row gets the margin line. Everything outside the creds block is unchanged (check with source mode or git diff).
- [ ] History modal lists entries, reveal and copy work, delete asks for confirmation and removes one entry.
- [ ] Add credential: id is suggested from note name and label, an existing id is refused.
- [ ] Delete credential asks for confirmation and removes the entry with its history.
- [ ] `Notes/Scratch.md`: first block renders, second shows "Can't read this block: YAML error on line N".
- [ ] Search (ribbon icon or command): `home root`, `prod pg`, `192.168`, `api token`. Enter, Shift+Enter, Cmd/Ctrl+Enter, Alt+Enter do what the hints say.
- [ ] New resource: creates `Infra/<name>.md` from the template and opens it; existing name is refused.
- [ ] Settings: values persist after reload; security statement visible.
- [ ] Light and dark theme both readable.

## Spaces and addresses (0.2)

- [ ] Settings → Spaces: add `Work` → `Work`. Rename `Infra` to `Personal`.
- [ ] Search subtitles show `Personal · ...` and `Work · ...`. `@work` lists only Mail Server, `@p root` only Personal results, `@nope` explains the available spaces.
- [ ] HomeServer network block: groups Public (main, failover), Private (lan, with `vmbr0`, `vlan 20` and `ethId: 2`), VPN (tailscale), Ports (8006, 5432 with note). Warning for port 99999. `failover` shows "public (guessed)".
- [ ] Address row buttons: copy address, copy SSH command (`ssh -p 22 root@<ip>`, user from the root credential), delete with confirmation.
- [ ] Add address with `10.0.0.9/24`, scope auto, label `test`: appears under Private. Add address `box.example.com`: appears under Public. Add port `443`, service `https`: appears under Ports. Text outside the block stays the same.
- [ ] Commands "Add address" and "Add port" in a note without a network block create one above the creds block.
- [ ] Mail Server (properties `ip` and `host`): chips above its creds block, clicking copies.
- [ ] Search `tailscale root`, `vmbr0`, `ethId`, `failover`: HomeServer results. Cmd/Ctrl+Enter on HomeServer root: picker lists all four addresses with label, scope and command.
- [ ] Mail Server (one ip, one host): picker shows both. Forge (no address): Notice explains there is no SSH command.
- [ ] New resource with two spaces: space dropdown, note lands in the chosen folder, the choice is remembered next time.
- [ ] An old `data.json` with `resourceFolder` loads as one space.

## Devices and ledger (0.3)

- [ ] `Assets/Laptop 07.md`: ledger shows "Assigned to Mehmet Kaya since 2026-06-15", timeline with assigned and note events, `invoice: INV-2026-118` as a detail. Person names are links.
- [ ] Assign → pick Ayşe Yılmaz (person note) → note "new hire". Properties `assigned_to` becomes `"[[Ayşe Yılmaz]]"` and only that line changes; ledger gets "assigned to Ayşe" on top and "returned from Mehmet" below it.
- [ ] Assign → type a new name without a note ("Guest"): suggestion "plain text, no person note", written as plain text.
- [ ] Return with a note: `assigned_to` is emptied, ledger logs the return, Return button disappears.
- [ ] Add event: service with today's date and a note, shows on top.
- [ ] Office Printer (no ledger block): command "Assign" creates a ledger block at the end of the note.
- [ ] Open `People/Ayşe Yılmaz.md`: backlinks list Laptop 07.
- [ ] Search `macbook`, `C02XYZ`, `ayse`, `office 2f`: Laptop 07. Subtitle shows "with <name>". People and locations show without SSH actions.
- [ ] New resource → device: template with hardware fields, network, creds and ledger blocks. person and location: no creds block.

## Inventory panel (0.4)

- [ ] Ribbon list icon or "Open inventory" opens the panel in the right sidebar.
- [ ] Resources tab: every resource once, counts in Addr and Creds columns. Click a column header to sort, click again to reverse. Click a row to open the note.
- [ ] Filters: type device, then holder Mehmet Kaya: only Laptop 07. Text `@work`: only Work space. Clearing a filter brings rows back.
- [ ] People tab: Mehmet Kaya (link to person note) with Laptop 07 and its since date; Not assigned group with Office Printer.
- [ ] Assign Laptop 07 to Ayşe: People tab moves it without reopening the panel.
- [ ] Warnings tab: Office Printer warranty ends soon; postgres app on HomeServer changed long ago; count of credentials without a change date; duplicate `homeserver-root`; ref `missing-id`; sync copy; block problems for Scratch.md and the 99999 port. Clicking a line opens the note.
- [ ] Settings: set warranty days to 0, the warranty group disappears.
- [ ] `People/Mehmet Kaya.md`: related list shows Laptop 07 under "Has now" with a Return button. After assigning Laptop 07 to Ayşe: Mehmet shows it under "Had before" with dates, Ayşe under "Has now".
- [ ] `Locations/Office 2F.md`: Laptop 07 and Office Printer under "Located here". `Infra/Apple.md`: Laptop 07 under "Provided here".
- [ ] "Add related list" on a note without one adds the block at the end; running it again says it already has one.

## Secret scan (0.5)

- [ ] "Scan vault for secrets" opens the scan panel. `Notes/Old Server Notes.md` lists: Administrator (next line), Sa password (medium), smtp connection with user and host, SQL password with user report_ro, AWS access and secret key. The echo and fastcgi lines are not listed. Managed blocks in other notes are not listed.
- [ ] Values are masked; the eye reveals one.
- [ ] Import the SQL password into a new note "Legacy SQL" (type database): note is created in the last used space, credential has user report_ro, kind db; the old note now reads `WITH PASSWORD = 'see [[Legacy SQL]]'` and nothing else in it changed. The finding disappears from the panel.
- [ ] Import the smtp password into an existing resource with "Replace in source" off: old note unchanged, credential added.
- [ ] Ignore a finding: it disappears and stays gone after "Scan again". Settings → Secret scan shows 1 hidden; "Show all again" brings it back.
- [ ] Settings → "Include values without a label" on: the two pasted values in the plain code block appear as low confidence.
- [ ] Edit the old note so a finding moves, then Import it: the import is refused with "the block changed" and nothing is written.

## Encryption (0.6)

- [ ] Settings → Encryption shows "Off" and the count of plain secrets.
- [ ] Set up: a password shorter than 12 characters or two different passwords are refused. The recovery key shows once; Done stays disabled until "I saved the recovery key" is on; Esc doesn't lose it.
- [ ] Encrypt all: Notice reports values and notes. Notes show `enc:v1:` for secrets and history in source mode; nothing else changed (check with git diff in the test vault). Broken blocks (Scratch.md) are reported as skipped.
- [ ] Rows show a lock icon. Reveal and copy work while unlocked.
- [ ] Lock command: revealed values hide, lock icons say locked. Reveal or copy asks for the password; a wrong password shows "Wrong password." and stays open.
- [ ] Unlock with the recovery key: asks for a new master password afterwards; the old password no longer works.
- [ ] Change password on a credential while encrypted: the new value is written encrypted, the old one moves to history encrypted.
- [ ] Add credential and scan Import while encrypted: secrets are written encrypted.
- [ ] Auto-lock: set 1 minute, wait, values lock.
- [ ] Turn off while values are encrypted is refused with the count. Decrypt all, then Turn off works.
- [ ] `node scripts/decrypt.mjs test-vault/.obsidian/plugins/infra-ledger/data.json "test-vault/Infra/HomeServer.md"` prints the note with plain secrets after the master password.

## Key auth and SSH login (0.7)

- [ ] HomeServer: the deploy row shows a key icon and `homeserver_ed25519` (full path on hover), no password.
- [ ] Copy SSH login on deploy: picker lists all four addresses with label and scope; picking `lan` copies `ssh -p 22 -i ~/.ssh/homeserver_ed25519 deploy@192.168.1.10`.
- [ ] Copy SSH login on root (password): command without `-i`, Notice reminds to copy the password separately.
- [ ] Forge ref row on HomeServer: Copy SSH login uses HomeServer's addresses with `forge` and `~/.ssh/forge_shared`; the copy button copies the passphrase.
- [ ] Mail Server (one ip, one host): picker with two rows. A note without addresses shows no SSH button.
- [ ] Add credential → Sign in with: SSH key: Key file field appears, Password becomes Passphrase (optional), Kind switches to ssh. Saved entry has `auth: key` and `key_path`, no secret when the passphrase is empty.
- [ ] Search `deploy`, Cmd/Ctrl+Enter: commands include `-i`. Enter on a key credential without passphrase explains it logs in with a key.

## Editing (0.7.1)

- [ ] Pencil on a credential row opens the form filled in; the password field is replaced by a hint, the id is read-only. Change label and note, save: only those lines change, the secret and unknown fields stay.
- [ ] Switch a password credential to SSH key with a key file, save: `auth: key` and `key_path` appear; switch back: both disappear.
- [ ] Pencil on an address: form filled in (with `/cidr`, scope "auto" when it was guessed). Change the label: only that row changes, `ethId` stays.
- [ ] Pencil on a port: change the service, save.
- [ ] Edit a row after changing the block by hand so the row moved: save is refused with "the block changed".

## Mobile

- [ ] Block renders and fits a phone screen (kind column hidden).
- [ ] Copy works; clipboard is emptied after the delay.
- [ ] Search: tapping a result opens the action menu, with one SSH row per address.
- [ ] Encryption: unlock with the master password on the phone (PBKDF2 takes a moment), reveal and copy work.
