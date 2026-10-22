import { STALE, type MutateResult } from "../creds/yaml-doc";
import type { Kind } from "../model";
import type { Finding } from "./detect";

/** Swaps the secret text of a finding, and nothing else, if it is still where the scan saw it. */
export function replaceFinding(note: string, f: Pick<Finding, "start" | "end" | "value">, replacement: string): MutateResult {
  if (note.slice(f.start, f.end) !== f.value) return { ok: false, reason: STALE };
  return { ok: true, note: note.slice(0, f.start) + replacement + note.slice(f.end) };
}

export function guessKind(f: Finding): Kind {
  if (f.kind === "sql") return "db";
  if (f.kind === "dsn") return /^(mysql|mariadb|postgres|postgresql|mongodb|mongodb\+srv|redis|mssql|sqlserver)\b/i.test(f.label) ? "db" : "other";
  if (f.kind === "token") return f.label === "Private key" ? "ssh" : "api-key";
  const label = f.label.toLowerCase();
  if (/\b(ssh|root|sudo)\b/.test(label)) return "ssh";
  if (/\b(panel|admin|administrator|portal|dashboard|login)\b/.test(label)) return "panel";
  if (/\b(db|database|mysql|postgres|sql|sa)\b/.test(label)) return "db";
  if (/(api|token|key)/.test(label)) return "api-key";
  return "other";
}

/** A short credential label: the user when known, else the finding's label without password words. */
export function suggestLabel(f: Finding): string {
  if (f.user && f.kind !== "token") return f.user;
  const cleaned = f.label
    .replace(/[`"'*#:=✅]/g, " ")
    .replace(/\b(password|passwd|pass|pwd|şifre(si)?|sifre(si)?|parola(sı)?|echo)\b/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || f.label.trim();
}

/** SHA-256 of the note path and line text, so an ignored finding can be recognised without keeping its value. */
export async function fingerprint(path: string, lineText: string): Promise<string> {
  const data = new TextEncoder().encode(`${path}\n${lineText.trim()}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
