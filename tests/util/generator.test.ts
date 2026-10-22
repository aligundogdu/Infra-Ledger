import { describe, expect, it } from "vitest";
import { generatePassword, AMBIGUOUS } from "../../src/util/generator";

describe("generatePassword", () => {
  it("returns the requested length", () => {
    for (const length of [8, 24, 64]) {
      expect(generatePassword({ length, symbols: true, excludeAmbiguous: false })).toHaveLength(length);
    }
  });

  it("uses only letters and digits without symbols", () => {
    for (let i = 0; i < 50; i++) {
      expect(generatePassword({ length: 32, symbols: false, excludeAmbiguous: false })).toMatch(/^[A-Za-z0-9]+$/);
    }
  });

  it("excludes ambiguous characters when asked", () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword({ length: 64, symbols: true, excludeAmbiguous: true });
      for (const ch of AMBIGUOUS) expect(p).not.toContain(ch);
    }
  });

  it("includes every enabled class", () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword({ length: 8, symbols: true, excludeAmbiguous: true });
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(/[^A-Za-z0-9]/);
    }
  });

  it("never emits characters that break YAML or shells badly", () => {
    for (let i = 0; i < 50; i++) {
      expect(generatePassword({ length: 64, symbols: true, excludeAmbiguous: false })).not.toMatch(/["'`\\\s]/);
    }
  });

  it("raises the length to fit one character per class", () => {
    expect(generatePassword({ length: 2, symbols: true, excludeAmbiguous: false })).toHaveLength(4);
  });
});
