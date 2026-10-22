import { describe, expect, it } from "vitest";
import { parse } from "yaml";

describe("toolchain", () => {
  it("runs tests and resolves dependencies", () => {
    expect(parse("a: 1")).toEqual({ a: 1 });
  });
});
