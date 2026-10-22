import { describe, expect, it } from "vitest";
import { createKeyRecord, encryptValue } from "../../src/crypto/keys";
// @ts-expect-error plain JS script without types
import { dataKey, decryptNote, decryptValue } from "../../scripts/decrypt.mjs";

describe("scripts/decrypt.mjs", () => {
  it("decrypts what the plugin encrypts, with the password or the recovery key", async () => {
    const { record, recoveryKey, session } = await createKeyRecord("master password", 1000);
    const enc = await encryptValue(session, "Ayşe'nin şifresi \"x\"");
    expect(await decryptValue(await dataKey(record, "master password"), enc)).toBe("Ayşe'nin şifresi \"x\"");
    expect(await decryptValue(await dataKey(record, recoveryKey, true), enc)).toBe("Ayşe'nin şifresi \"x\"");
    await expect(dataKey(record, "wrong")).rejects.toThrow();
  });

  it("decrypts a whole note", async () => {
    const { record, session } = await createKeyRecord("pw", 1000);
    const note = `- id: a\n  secret: "${await encryptValue(session, "one")}"\n  history:\n    - secret: "${await encryptValue(session, "two")}"\n`;
    expect(await decryptNote(await dataKey(record, "pw"), note)).toBe('- id: a\n  secret: "one"\n  history:\n    - secret: "two"\n');
  });
});
