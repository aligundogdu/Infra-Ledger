# Encryption format

Infra Ledger can encrypt the `secret` fields of `creds` blocks, including old values in `history`. Everything else (users, notes, properties, network blocks) stays plain text so it can be searched. This document is enough to decrypt your data without the plugin; `scripts/decrypt.mjs` does exactly this.

## Values

```
enc:v1:<iv>:<data>
```

- `iv`: 12 random bytes, base64.
- `data`: AES-256-GCM ciphertext with the 16-byte tag appended, base64.
- Additional authenticated data: the UTF-8 bytes of `infra-ledger:v1`.
- The plaintext is the secret as UTF-8.

## Keys

A random 32-byte data key encrypts every value. It is stored twice in the plugin's `data.json`, under `encryption`:

```json
{
  "version": 1,
  "kdf": { "iterations": 600000, "salt": "<16 bytes, base64>" },
  "byPassword": { "iv": "<base64>", "data": "<base64>" },
  "byRecovery": { "iv": "<base64>", "data": "<base64>" }
}
```

- `byPassword`: the data key encrypted with AES-256-GCM (same AAD) under a key derived from the master password: PBKDF2, SHA-256, the stored salt and iteration count, 256-bit output.
- `byRecovery`: the data key encrypted with AES-256-GCM (same AAD) under the recovery key used directly as a 256-bit AES key.
- The recovery key is 32 random bytes shown once as Crockford base32 in groups of four (`7Q2M-...`). Reading it back, case, spaces and dashes are ignored, `O` reads as `0` and `I`/`L` as `1`.
- The master password, the recovery key and the plain data key are never written anywhere.

## Without the plugin

```bash
node scripts/decrypt.mjs <vault>/.obsidian/plugins/infra-ledger/data.json "enc:v1:..."
node scripts/decrypt.mjs <vault>/.obsidian/plugins/infra-ledger/data.json "Infra/HomeServer.md"
node scripts/decrypt.mjs <data.json> <value-or-note> --recovery
```

The script asks for the master password (or the recovery key with `--recovery`) and prints the plaintext. It needs Node 18 or newer and no packages.

## What it protects

Someone who copies your notes without `data.json`, or with `data.json` but without your password or recovery key, can't read encrypted secrets. It doesn't hide hostnames, users, notes or which resources exist, and it doesn't protect secrets while the vault is unlocked on a device someone else is using.
