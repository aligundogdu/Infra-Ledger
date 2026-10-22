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

## Mobile

- [ ] Block renders and fits a phone screen (kind column hidden).
- [ ] Copy works; clipboard is emptied after the delay.
- [ ] Search: tapping a result opens the action menu.
