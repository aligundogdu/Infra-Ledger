#!/usr/bin/env node
// Decrypts Infra Ledger values without Obsidian. Needs Node 18 or newer and nothing else.
//
//   node scripts/decrypt.mjs <vault>/.obsidian/plugins/infra-ledger/data.json "enc:v1:..."
//   node scripts/decrypt.mjs <data.json> path/to/note.md            prints the note with secrets decrypted
//   node scripts/decrypt.mjs <data.json> <value-or-note> --recovery  asks for the recovery key instead
//
// Format: docs/encryption.md

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const PREFIX = "enc:v1:";
const AAD = new TextEncoder().encode("infra-ledger:v1");
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const subtle = globalThis.crypto.subtle;

const unb64 = (t) => Uint8Array.from(Buffer.from(t, "base64"));

function fromBase32(text) {
  const clean = text.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  const out = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i === -1) throw new Error(`Invalid character "${ch}" in recovery key.`);
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

async function aesKey(raw) {
  return subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
}

async function open(wrapped, key) {
  return new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: unb64(wrapped.iv), additionalData: AAD }, key, unb64(wrapped.data)));
}

/** Returns the data key from a key record and the master password or recovery key. */
export async function dataKey(record, secret, useRecovery = false) {
  if (useRecovery) return aesKey(await open(record.byRecovery, await aesKey(fromBase32(secret))));
  const base = await subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveKey"]);
  const kek = await subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: unb64(record.kdf.salt), iterations: record.kdf.iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  return aesKey(await open(record.byPassword, kek));
}

export async function decryptValue(key, value) {
  const [iv, data] = value.slice(PREFIX.length).split(":");
  const plain = await subtle.decrypt({ name: "AES-GCM", iv: unb64(iv), additionalData: AAD }, key, unb64(data));
  return new TextDecoder().decode(plain);
}

/** Replaces every quoted or bare enc:v1 value in a note with its plaintext (JSON-quoted). */
export async function decryptNote(key, text) {
  const re = /"?(enc:v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+)"?/g;
  let out = "";
  let pos = 0;
  for (const m of text.matchAll(re)) {
    out += text.slice(pos, m.index) + JSON.stringify(await decryptValue(key, m[1]));
    pos = m.index + m[0].length;
  }
  return out + text.slice(pos);
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  return new Promise((resolve) => {
    // Hide the typed secret.
    rl._writeToOutput = (s) => rl.output.write(s.includes(question) ? s : "");
    rl.question(question, (answer) => {
      rl.close();
      process.stderr.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const [dataPath, target, flag] = process.argv.slice(2);
  if (!dataPath || !target) {
    console.error("Usage: node scripts/decrypt.mjs <data.json> <enc:v1:... | note.md> [--recovery]");
    process.exit(2);
  }
  const record = JSON.parse(readFileSync(dataPath, "utf8")).encryption;
  if (!record) {
    console.error("This data.json has no encryption record.");
    process.exit(1);
  }
  const useRecovery = flag === "--recovery";
  const secret = await ask(useRecovery ? "Recovery key: " : "Master password: ");
  let key;
  try {
    key = await dataKey(record, secret, useRecovery);
  } catch {
    console.error("Wrong password or recovery key.");
    process.exit(1);
  }
  if (target.startsWith(PREFIX)) console.log(await decryptValue(key, target));
  else process.stdout.write(await decryptNote(key, readFileSync(target, "utf8")));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
