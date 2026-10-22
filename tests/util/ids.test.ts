import { describe, expect, it } from "vitest";
import { slugify, suggestId } from "../../src/util/ids";

describe("suggestId", () => {
  it("joins resource name and label as a slug", () => {
    expect(suggestId("HomeServer", "postgres app", new Set())).toBe("homeserver-postgres-app");
  });
  it("folds Turkish and accented characters", () => {
    expect(slugify("Şirket Sunucusu Ğüİöç")).toBe("sirket-sunucusu-guioc");
    expect(slugify("Café  Déjà--vu!")).toBe("cafe-deja-vu");
  });
  it("adds a numeric suffix on collision", () => {
    const taken = new Set(["home-root", "home-root-2"]);
    expect(suggestId("Home", "root", taken)).toBe("home-root-3");
  });
  it("falls back when the label slug is empty", () => {
    expect(suggestId("Home", "***", new Set())).toBe("home-credential");
  });
});
