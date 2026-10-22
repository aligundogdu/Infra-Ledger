/**
 * Optional encryption for secret fields. A random data key encrypts values; it is stored twice,
 * wrapped by a key derived from the master password and by a random recovery key.
 * Format and parameters are documented in docs/encryption.md.
 */

export const PREFIX = "enc:v1:";
export const DEFAULT_ITERATIONS = 600_000;
const AAD = new TextEncoder().encode("infra-ledger:v1");

export interface Wrapped {
  iv: string;
  data: string;
}

export interface KeyRecord {
  version: 1;
  kdf: { iterations: number; salt: string };
  byPassword: Wrapped;
  byRecovery: Wrapped;
}

/** An unlocked data key. Lives in memory only. */
export interface Session {
  raw: Uint8Array;
  key: CryptoKey;
}

export class WrongSecretError extends Error {
  constructor(message = "Wrong password or recovery key.") {
    super(message);
    this.name = "WrongSecretError";
  }
}

export async function createKeyRecord(
  password: string,
  iterations = DEFAULT_ITERATIONS,
): Promise<{ record: KeyRecord; recoveryKey: string; session: Session }> {
  const raw = random(32);
  const recovery = random(32);
  const salt = random(16);
  const record: KeyRecord = {
    version: 1,
    kdf: { iterations, salt: b64(salt) },
    byPassword: await wrap(raw, await passwordKey(password, salt, iterations)),
    byRecovery: await wrap(raw, await aesKey(recovery)),
  };
  return { record, recoveryKey: toBase32(recovery), session: await sessionFrom(raw) };
}

export async function unlockWithPassword(record: KeyRecord, password: string): Promise<Session> {
  const key = await passwordKey(password, unb64(record.kdf.salt), record.kdf.iterations);
  return sessionFrom(await unwrap(record.byPassword, key));
}

export async function unlockWithRecovery(record: KeyRecord, recoveryKey: string): Promise<Session> {
  let bytes: Uint8Array;
  try {
    bytes = fromBase32(recoveryKey);
  } catch {
    throw new WrongSecretError();
  }
  if (bytes.length !== 32) throw new WrongSecretError();
  return sessionFrom(await unwrap(record.byRecovery, await aesKey(bytes)));
}

/** New master password, same data key and recovery key. */
export async function rewrapPassword(
  record: KeyRecord,
  session: Session,
  password: string,
  iterations = DEFAULT_ITERATIONS,
): Promise<KeyRecord> {
  const salt = random(16);
  return {
    ...record,
    kdf: { iterations, salt: b64(salt) },
    byPassword: await wrap(session.raw, await passwordKey(password, salt, iterations)),
  };
}

/** New recovery key; the old one stops working. */
export async function newRecoveryKey(record: KeyRecord, session: Session): Promise<{ record: KeyRecord; recoveryKey: string }> {
  const recovery = random(32);
  return {
    record: { ...record, byRecovery: await wrap(session.raw, await aesKey(recovery)) },
    recoveryKey: toBase32(recovery),
  };
}

export function isEncrypted(value: string | undefined): boolean {
  return !!value && value.startsWith(PREFIX);
}

export async function encryptValue(session: Session, plaintext: string): Promise<string> {
  const iv = random(12);
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource, additionalData: AAD },
    session.key,
    new TextEncoder().encode(plaintext),
  );
  return `${PREFIX}${b64(iv)}:${b64(new Uint8Array(data))}`;
}

export async function decryptValue(session: Session, value: string): Promise<string> {
  const parts = value.slice(PREFIX.length).split(":");
  if (!value.startsWith(PREFIX) || parts.length !== 2) throw new WrongSecretError("Not an encrypted value.");
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(parts[0]) as BufferSource, additionalData: AAD },
      session.key,
      unb64(parts[1]) as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new WrongSecretError("This value can't be decrypted with the current key.");
  }
}

// Crockford base32: no I, L, O, U; reads well on paper.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out.match(/.{1,4}/g)!.join("-");
}

export function fromBase32(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  const out: number[] = [];
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

async function sessionFrom(raw: Uint8Array): Promise<Session> {
  return { raw, key: await aesKey(raw) };
}

async function passwordKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function aesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function wrap(raw: Uint8Array, key: CryptoKey): Promise<Wrapped> {
  const iv = random(12);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: AAD }, key, raw as BufferSource);
  return { iv: b64(iv), data: b64(new Uint8Array(data)) };
}

async function unwrap(w: Wrapped, key: CryptoKey): Promise<Uint8Array> {
  try {
    const raw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(w.iv) as BufferSource, additionalData: AAD },
      key,
      unb64(w.data) as BufferSource,
    );
    return new Uint8Array(raw);
  } catch {
    throw new WrongSecretError();
  }
}

function random(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
