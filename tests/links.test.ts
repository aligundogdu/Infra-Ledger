import { describe, expect, it } from "vitest";
import { parseLinkValue } from "../src/links";

describe("parseLinkValue", () => {
  it("reads wiki links with and without alias", () => {
    expect(parseLinkValue("[[Ayse Yilmaz]]")).toEqual({ display: "Ayse Yilmaz", link: "Ayse Yilmaz" });
    expect(parseLinkValue("[[People/Ayse Yilmaz|Ayse]]")).toEqual({ display: "Ayse", link: "People/Ayse Yilmaz" });
    expect(parseLinkValue("[[Hetzner#FSN1]]")).toEqual({ display: "Hetzner#FSN1", link: "Hetzner#FSN1" });
  });
  it("keeps plain text as is", () => {
    expect(parseLinkValue("Mehmet Kaya")).toEqual({ display: "Mehmet Kaya" });
    expect(parseLinkValue("  ")).toBeNull();
    expect(parseLinkValue(undefined)).toBeNull();
    expect(parseLinkValue(["[[A]]"])).toEqual({ display: "A", link: "A" });
  });
});
