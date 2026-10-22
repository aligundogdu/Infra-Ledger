import { describe, expect, it } from "vitest";
import { ledgerStatus, parseLedgerBlock } from "../../src/ledger/parse";

describe("parseLedgerBlock", () => {
  it("reads events newest first with links and unknown fields", () => {
    const r = parseLedgerBlock(`- date: 2026-10-22
  event: assigned
  to: "[[Ayse Yilmaz]]"
  note: new hire
  ticket: IT-42
- date: 2026-09-01
  event: service
  note: battery replaced
- date: 2026-06-15
  event: returned
  from: Mehmet Kaya
`);
    expect(r.ok).toBe(true);
    expect(r.events).toEqual([
      { date: "2026-10-22", event: "assigned", to: { display: "Ayse Yilmaz", link: "Ayse Yilmaz" }, note: "new hire", extra: { ticket: "IT-42" }, index: 0 },
      { date: "2026-09-01", event: "service", note: "battery replaced", extra: {}, index: 1 },
      { date: "2026-06-15", event: "returned", from: { display: "Mehmet Kaya" }, extra: {}, index: 2 },
    ]);
  });

  it("treats unknown events as notes and keeps the written name", () => {
    const [e] = parseLedgerBlock(`- date: 2026-01-01\n  event: painted\n`).events;
    expect(e.event).toBe("note");
    expect(e.extra).toEqual({ event: "painted" });
  });

  it("warns about entries without date or event", () => {
    const r = parseLedgerBlock(`- event: note\n- date: 2026-01-01\n- date: 2026-01-02\n  event: note\n`);
    expect(r.events).toHaveLength(1);
    expect(r.issues.map((i) => [i.code, i.line])).toEqual([["invalid-ledger-entry", 1], ["invalid-ledger-entry", 2]]);
  });

  it("reads raw dates and handles empty and broken blocks", () => {
    expect(parseLedgerBlock("- date: 2026-10-22\n  event: note\n").events[0].date).toBe("2026-10-22");
    expect(parseLedgerBlock("")).toEqual({ events: [], issues: [], ok: true });
    expect(parseLedgerBlock('- date: "x\n').ok).toBe(false);
  });
});

describe("ledgerStatus", () => {
  const ev = (event: string, date: string, to?: string) =>
    parseLedgerBlock(`- date: ${date}\n  event: ${event}\n${to ? `  to: ${to}\n` : ""}`).events;

  it("follows the newest assignment, return or retirement", () => {
    expect(ledgerStatus([...ev("service", "2026-10-01"), ...ev("assigned", "2026-09-01", "Ayse")], "Ayse")).toEqual({
      kind: "assigned", who: { display: "Ayse" }, since: "2026-09-01",
    });
    expect(ledgerStatus(ev("retired", "2026-10-01"), "Ayse")).toEqual({ kind: "retired", since: "2026-10-01" });
    expect(ledgerStatus(ev("returned", "2026-10-01"), null)).toEqual({ kind: "unassigned" });
  });
  it("trusts the property when the log has no matching assignment", () => {
    expect(ledgerStatus([], "[[Ayse]]")).toEqual({ kind: "assigned", who: { display: "Ayse", link: "Ayse" } });
    expect(ledgerStatus([], null)).toEqual({ kind: "unassigned" });
  });
});
