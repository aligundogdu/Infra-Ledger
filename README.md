<p align="center">
  <img src="brand/logo/logo.svg" alt="Infra Ledger" width="360">
</p>

<p align="center"><strong>Credentials with a paper trail.</strong></p>

<p align="center">
  <a href="https://github.com/aligundogdu/Infra-Ledger/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/aligundogdu/Infra-Ledger/ci.yml?branch=main&style=flat-square&label=ci&color=2D6A4F"></a>
  <a href="https://github.com/aligundogdu/Infra-Ledger/releases"><img alt="Release" src="https://img.shields.io/github/v/release/aligundogdu/Infra-Ledger?style=flat-square&color=2D6A4F&include_prereleases"></a>
  <img alt="Obsidian" src="https://img.shields.io/badge/obsidian-%E2%89%A5%201.4.10-15191E?style=flat-square&logo=obsidian&logoColor=white">
  <img alt="Platforms" src="https://img.shields.io/badge/platforms-desktop%20%C2%B7%20mobile-15191E?style=flat-square">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/aligundogdu/Infra-Ledger?style=flat-square&color=B8432F"></a>
</p>

---

Infra Ledger keeps your servers, databases and cloud accounts as notes in your vault. Each note holds a `creds` block with the users and passwords for that resource. When you rotate a password, the old one moves to a dated history with the reason you gave. Search across everything from the command palette and copy a password, a username or a ready SSH command with one key.

Everything is plain Markdown. Remove the plugin and your notes still read fine.

> [!NOTE]
> Infra Ledger is in early development. The format below is stable enough to start writing notes in, but there is no release yet.

## What it does

- **One note per resource.** Servers, databases, cloud accounts and services, each with flat properties you can search and query with Dataview.
- **Several credentials per resource.** `root`, `deploy`, `postgres app`, `panel admin`, each with its own user, secret and kind.
- **Password history.** "Change password" moves the old value into history with today's date and an optional reason. Nothing is overwritten.
- **Shared credentials.** Define a credential once and reference it from other resources with `ref`.
- **Quick search.** Type `prod pg deploy` and copy the secret, the username or `ssh -p 22 deploy@10.0.0.4`. Every ip, host, port and label is searchable.
- **Spaces.** Keep personal and work resources in separate folders. New resources go where you pick, `@work` in search shows one space only.
- **Network details.** Several public, private and VPN addresses per server with interface, MAC, gateway, VLAN and any field you add. Pick which address the SSH command uses.
- **Clipboard that cleans up.** Copied secrets are cleared after 30 seconds (configurable).
- **Optional encryption.** Secret fields encrypted with a master password, a recovery key for emergencies, and a script that decrypts without the plugin.
- **Devices and assignments.** Hardware details, who has which device, and a log of assignments, returns, repairs and moves.
- **Secret scan.** Finds passwords, connection strings, SQL logins, cloud keys and private keys scattered across your notes and moves them into resources one by one.
- **Inventory panel.** One sortable table of everything with filters, a "who has what" list, and warnings for warranties running out, old passwords, duplicate ids, broken refs and block errors.
- **Desktop and mobile.** No Node APIs, works on iOS and Android.

## The format

A resource is a note with a `type` in its properties. Credentials live in a `creds` code block.

````markdown
---
type: server          # server | database | cloud | service | other
provider: proxmox
env: home
ssh_port: 22
tags: [homelab]
---

# HomeServer

Anything you like goes here: setup notes, services, incidents.

```network
- ip: 85.10.20.30/26
  scope: public           # public | private | vpn | other, guessed when left out
  label: main
  iface: eth0
  gateway: 85.10.20.1
- ip: 192.168.1.10
  label: lan
  vlan: 20
  ethId: 2                # any field you add is kept, shown and searchable
- ip: 100.64.0.7
  label: tailscale
- port: 5432
  service: postgres
  note: lan only
```

```creds
- id: homeserver-root
  label: root
  user: root
  secret: "correct-horse-battery"
  kind: ssh                 # ssh | db | panel | api-key | other
  note: sudo uses the same password
  updated: 2026-10-22
  history:
    - secret: "old-password"
      until: 2026-03-10
      reason: rotation
- id: homeserver-postgres
  label: postgres app
  user: appuser
  secret: "s3cret"
  kind: db
- ref: forge-shared-key     # defined in another resource
```
````

In reading view the `creds` block renders as a table with masked secrets and buttons to reveal, copy, change and view history. The `network` block renders grouped by Public, Private, VPN and Ports, with buttons to copy an address, copy an SSH command or add a new address or port from a form.

A server with a single address can skip the block and use properties instead: `ip: 10.0.0.4`, `host: box.example.com`, `ports: [22 ssh, 443 https]`. Those show as chips above the credentials.

### Devices and assignments

Laptops, phones, routers and printers are `type: device` notes with hardware fields. A `ledger` block keeps their history, newest on top. `person` and `location` notes are plain directory entries you can link to.

````markdown
---
type: device
device_type: laptop
model: MacBook Pro 14 M3
serial: C02XYZ123
location: "[[Office 2F]]"
assigned_to: "[[Ayşe Yılmaz]]"
warranty_until: 2027-05-01
---

```ledger
- date: 2026-10-22
  event: assigned          # assigned | returned | service | repair | upgrade | moved | lost | retired | note
  to: "[[Ayşe Yılmaz]]"
  note: new hire
- date: 2026-09-01
  event: service
  note: battery replaced
```
````

Add an empty `related` block to a person, location or provider note and it lists everything that points there: the devices someone has now (with a Return button), what they had before, what sits at a location, what runs at a provider. New person and location notes come with it.

**Assign** picks a person (person notes first, any name works), logs the previous holder as returned and updates `assigned_to`. **Return** and **Add event** work the same way. Because people, locations and providers can be notes, their backlinks list every device and server that points to them. `ledger` blocks work on any resource, so a server can log "moved to HEL1" or "RAM upgraded" too.

Rules worth knowing:

- `id` must be unique across the vault. The plugin suggests one when you add a credential.
- Values are read exactly as written. `secret: 0123456` stays `0123456`, it is never turned into a number.
- The plugin only rewrites the `creds` block it is changing. The rest of the note stays byte for byte the same.

## Commands

| Command | What it does |
|---|---|
| Search | Find a resource or credential and copy from it |
| Open inventory | Side panel with Resources, People and Warnings |
| Add related list | Add a `related` block to the current note |
| Scan vault for secrets | List secrets outside creds blocks and import them into resources |
| Lock / Unlock | Forget or load the encryption key |
| Encrypt all secrets / Decrypt all secrets | Convert every secret field in the vault |
| New resource | Create a resource note from a template |
| Add credential | Add a credential to the current note |
| Add address | Add an ip or host to the current note's network block |
| Add port | Add a port to the current note's network block |
| Assign | Give the current device to a person and log it |
| Return | Take the current device back and log it |
| Add event | Log a service, repair, upgrade, move, loss, retirement or note |
| Change password | Rotate a secret and keep the old one in history |
| Show history | List previous secrets of a credential |

In search:

| Key | Action |
|---|---|
| <kbd>Enter</kbd> | Copy secret |
| <kbd>Shift</kbd> <kbd>Enter</kbd> | Copy username |
| <kbd>Cmd/Ctrl</kbd> <kbd>Enter</kbd> | Copy SSH command |
| <kbd>Alt</kbd> <kbd>Enter</kbd> | Open note |

When a server has more than one address, <kbd>Cmd/Ctrl</kbd> <kbd>Enter</kbd> asks which one to use. Start the query with `@` and a space name (`@work prod`) to search one space. On mobile, tap a result to get the same actions as a menu.

## Cleaning up old notes

**Scan vault for secrets** reads every note (not the `creds`, `network`, `ledger` and `related` blocks) and lists what looks like a secret:

- labelled values: `password: …`, `şifre = …`, a value on the line after `Administrator Password`
- connection strings: `mysql://user:pass@host`, `MAILER_DSN=smtp://…`
- SQL: `IDENTIFIED BY '…'`, `WITH PASSWORD = '…'`
- AWS, GitHub, Stripe and Slack keys, private key blocks, `.env` lines like `DB_PASSWORD=…`
- optionally, lone random-looking lines in plain code blocks

Values stay masked until you reveal them. **Import** fills in label, user and kind from what it found, adds the credential to an existing or new resource and, if you keep the option on, replaces the secret in the old note with `see [[Resource]]`. **Ignore** hides a finding for good; only a SHA-256 fingerprint of the line is stored. The scan runs locally and changes nothing without your click.

## Security

> Infra Ledger stores everything in your vault as plain Markdown. If your vault syncs to iCloud, Dropbox or Git, your credentials go with it. Optional encryption protects the `secret` fields with a master password. Hostnames, users and notes stay readable so you can search them.

Encryption is off until you set it up in Settings → Infra Ledger. Then:

- A random data key encrypts each `secret` and every old value in `history` with AES-256-GCM. Values look like `enc:v1:…` in the note.
- The data key is stored twice in the plugin's `data.json`: wrapped by your master password (PBKDF2, 600,000 rounds) and by a recovery key you get once and keep somewhere else.
- While unlocked the key lives in memory only; it is dropped after 15 minutes without use (configurable) or with the **Lock** command.
- **Encrypt all secrets** and **Decrypt all secrets** convert the whole vault and change only those fields. Turning encryption off requires decrypting first, so nothing gets stranded.
- `scripts/decrypt.mjs` decrypts a value or a whole note with Node and no plugin. The format is in [`docs/encryption.md`](docs/encryption.md).

Infra Ledger is not a password manager: there is no browser autofill, no server and no team sharing.

## Roadmap

- **0.1** Credentials, block view, change password with history, quick search, new resource command.
- **0.2** Spaces (personal and work folders), network block with addresses and ports.
- **0.3** Devices, people and locations, assignment ledger.
- **0.4** Inventory side panel: filters, who has what, warranty and password age warnings.
- **0.5** Secret scan and import.
- **0.6** Optional encryption with a master password and a recovery key.

Out of scope: uptime and ping checks, network scanning, purchasing and depreciation.

## Install

Not yet in the community plugin browser. Until then:

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat).
2. In BRAT, add `aligundogdu/Infra-Ledger`.
3. Enable **Infra Ledger** in Settings → Community plugins.

## Development

```bash
npm install
npm run dev      # rebuild on change
npm test         # unit tests
npm run build    # type check and production build
```

`npm run vault` builds the plugin into `test-vault/`, a small vault with sample resources. Open it in Obsidian and follow [`docs/testing.md`](docs/testing.md).

Releases: `npm version patch` updates `manifest.json` and `versions.json` and tags the commit. Pushing the tag runs the release workflow, which attaches `main.js`, `manifest.json` and `styles.css` to a GitHub release.

Design notes live in [`docs/design.md`](docs/design.md), brand and copy rules in [`brand/brand.md`](brand/brand.md).

## License

[MIT](LICENSE) © Ali Gündoğdu
