<p align="center">
  <img src="brand/logo/logo.svg" alt="Infra Ledger" width="360">
</p>

<p align="center"><strong>Credentials with a paper trail.</strong></p>

<p align="center">
  <a href="https://github.com/aligundogdu/Infra-Ledger/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/aligundogdu/Infra-Ledger/ci.yml?branch=main&style=flat-square&label=ci&color=2D6A4F"></a>
  <a href="https://github.com/aligundogdu/Infra-Ledger/releases"><img alt="Release" src="https://img.shields.io/github/v/release/aligundogdu/Infra-Ledger?style=flat-square&color=2D6A4F&include_prereleases"></a>
  <img alt="Obsidian" src="https://img.shields.io/badge/obsidian-%E2%89%A5%201.1.0-15191E?style=flat-square&logo=obsidian&logoColor=white">
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
- **Several addresses and ports.** Public, private and Tailscale ips on one server; pick which one the SSH command uses.
- **Clipboard that cleans up.** Copied secrets are cleared after 30 seconds (configurable).
- **Desktop and mobile.** No Node APIs, works on iOS and Android.

## The format

A resource is a note with a `type` in its properties. Credentials live in a `creds` code block.

````markdown
---
type: server          # server | database | cloud | service | other
ip:                   # one value or a list, each with an optional label
  - 192.168.1.10 lan
  - 100.64.0.7 tailscale
provider: proxmox
env: home
ssh_port: 22
ports:
  - 8006 proxmox
  - 5432 postgres
tags: [homelab]
---

# HomeServer

Anything you like goes here: setup notes, services, incidents.

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

In reading view the block renders as a table with masked secrets and buttons to reveal, copy, change and view history. The note's addresses and ports show above it as chips you can click to copy.

Rules worth knowing:

- `id` must be unique across the vault. The plugin suggests one when you add a credential.
- Values are read exactly as written. `secret: 0123456` stays `0123456`, it is never turned into a number.
- The plugin only rewrites the `creds` block it is changing. The rest of the note stays byte for byte the same.

## Commands

| Command | What it does |
|---|---|
| Search | Find a resource or credential and copy from it |
| New resource | Create a resource note from a template |
| Add credential | Add a credential to the current note |
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

## Security

> Infra Ledger stores everything in your vault as plain Markdown. If your vault syncs to iCloud, Dropbox or Git, your credentials go with it. Optional encryption protects the `secret` fields with a master password. Hostnames, users and notes stay readable so you can search them.

Encryption is planned for v2. Until then, secrets are stored as plain text. Infra Ledger is not a password manager: there is no browser autofill, no server and no team sharing.

## Roadmap

- **v1** Format, block view, change password with history, add and delete credentials, quick search, new resource command.
- **v2** Optional encryption with a master password and a recovery key. A scanner that finds passwords scattered across your vault and imports them into resources.
- **v3** Inventory side panel with filters, warnings for passwords that haven't changed in a long time.

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
