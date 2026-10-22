/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

// Obsidian calls these on views and modals itself. A subclass method with the same name replaces
// Obsidian's and breaks opening (an inventory panel stayed blank because of a private open()).
const RESERVED = ["open", "close", "load", "unload", "setState", "getState", "setEphemeralState", "onResize"];

describe("ui classes", () => {
  it("don't shadow methods Obsidian calls on views and modals", () => {
    const offenders: string[] = [];
    for (const name of readdirSync("src/ui")) {
      const text = readFileSync(`src/ui/${name}`, "utf8");
      for (const method of RESERVED) {
        const re = new RegExp(`^\\s+(?:private |protected |public )?(?:async )?${method}\\(`, "m");
        if (re.test(text)) offenders.push(`${name}: ${method}()`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
