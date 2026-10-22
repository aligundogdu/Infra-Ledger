import { describe, expect, it } from "vitest";
import {
  createKeyRecord, decryptValue, encryptValue, fromBase32, isEncrypted, newRecoveryKey, rewrapPassword,
  toBase32, unlockWithPassword, unlockWithRecovery, WrongSecretError,
} from "../../src/crypto/keys";

const FAST = 1000;

describe("base32", () => {
  it("round-trips and tolerates spaces, dashes and case", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const text = toBase32(bytes);
    expect(text).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-)+[0-9A-HJKMNP-TV-Z]{1,4}$/);
    expect(fromBase32(text)).toEqual(bytes);
    expect(fromBase32(text.toLowerCase().replace(/-/g, " "))).toEqual(bytes);
    expect(fromBase32(text.replace(/0/g, "O").replace(/1/g, "I"))).toEqual(bytes);
  });
});

describe("key record", () => {
  it("unlocks with the password and with the recovery key to the same data key", async () => {
    const { record, recoveryKey, session } = await createKeyRecord("correct horse battery", FAST);
    const json = JSON.stringify(record);
    expect(json).not.toContain("correct horse");
    expect(json).not.toContain(recoveryKey);
    const a = await unlockWithPassword(record, "correct horse battery");
    const b = await unlockWithRecovery(record, recoveryKey);
    const enc = await encryptValue(session, "şifre 123");
    expect(await decryptValue(a, enc)).toBe("şifre 123");
    expect(await decryptValue(b, enc)).toBe("şifre 123");
  });

  it("rejects a wrong password or recovery key", async () => {
    const { record } = await createKeyRecord("correct horse battery", FAST);
    await expect(unlockWithPassword(record, "wrong")).rejects.toBeInstanceOf(WrongSecretError);
    await expect(unlockWithRecovery(record, toBase32(new Uint8Array(32)))).rejects.toBeInstanceOf(WrongSecretError);
    await expect(unlockWithRecovery(record, "not base32 !!")).rejects.toBeInstanceOf(WrongSecretError);
  });

  it("changes the password without touching the recovery key or the data", async () => {
    const { record, recoveryKey, session } = await createKeyRecord("old password 1", FAST);
    const enc = await encryptValue(session, "data");
    const next = await rewrapPassword(record, session, "new password 2", FAST);
    await expect(unlockWithPassword(next, "old password 1")).rejects.toBeInstanceOf(WrongSecretError);
    expect(await decryptValue(await unlockWithPassword(next, "new password 2"), enc)).toBe("data");
    expect(await decryptValue(await unlockWithRecovery(next, recoveryKey), enc)).toBe("data");
  });

  it("replaces the recovery key", async () => {
    const { record, recoveryKey, session } = await createKeyRecord("password one", FAST);
    const { record: next, recoveryKey: fresh } = await newRecoveryKey(record, session);
    await expect(unlockWithRecovery(next, recoveryKey)).rejects.toBeInstanceOf(WrongSecretError);
    expect(await unlockWithRecovery(next, fresh)).toBeTruthy();
    expect(await unlockWithPassword(next, "password one")).toBeTruthy();
  });
});

describe("values", () => {
  it("uses the enc:v1 format with a fresh iv each time", async () => {
    const { session } = await createKeyRecord("pw pw pw pw", FAST);
    const a = await encryptValue(session, "same");
    const b = await encryptValue(session, "same");
    expect(a).toMatch(/^enc:v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(a).not.toBe(b);
    expect(isEncrypted(a)).toBe(true);
    expect(isEncrypted("enc:v2:x:y")).toBe(false);
    expect(isEncrypted("plain")).toBe(false);
  });

  it("rejects tampered or malformed values", async () => {
    const { session } = await createKeyRecord("pw pw pw pw", FAST);
    const enc = await encryptValue(session, "secret value");
    const parts = enc.split(":");
    const data = Uint8Array.from(atob(parts[3]), (c) => c.charCodeAt(0));
    data[0] ^= 1;
    const tampered = [parts[0], parts[1], parts[2], btoa(String.fromCharCode(...data))].join(":");
    await expect(decryptValue(session, tampered)).rejects.toBeInstanceOf(WrongSecretError);
    await expect(decryptValue(session, "enc:v1:bad")).rejects.toBeInstanceOf(WrongSecretError);
  });
});
