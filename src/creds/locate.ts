import { parseCredsBlock } from "./parse";

export interface BlockLocation {
  /** Start of the opening fence line. */
  start: number;
  /** End of the closing fence line, before its line break. */
  end: number;
  contentStart: number;
  contentEnd: number;
  content: string;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/;

interface Line {
  text: string;
  start: number;
  /** Offset after the line break. */
  next: number;
}

function splitLines(note: string): Line[] {
  const lines: Line[] = [];
  let pos = 0;
  while (pos < note.length) {
    const nl = note.indexOf("\n", pos);
    const next = nl === -1 ? note.length : nl + 1;
    const raw = note.slice(pos, nl === -1 ? note.length : nl);
    lines.push({ text: raw.endsWith("\r") ? raw.slice(0, -1) : raw, start: pos, next });
    pos = next;
  }
  return lines;
}

/** Finds fenced ```creds (or ~~~creds) blocks, skipping fences of other languages. */
export function findCredsBlocks(note: string): BlockLocation[] {
  const lines = splitLines(note);
  const blocks: BlockLocation[] = [];
  let i = 0;
  while (i < lines.length) {
    const open = FENCE.exec(lines[i].text);
    if (!open) {
      i++;
      continue;
    }
    const fence = open[1];
    const lang = open[2];
    let close = -1;
    for (let j = i + 1; j < lines.length; j++) {
      const t = lines[j].text.trim();
      if (t.length >= fence.length && t === fence[0].repeat(t.length) && lines[j].text.search(/\S/) <= 3) {
        close = j;
        break;
      }
    }
    if (close === -1) {
      i++;
      continue;
    }
    if (lang === "creds") {
      const contentStart = lines[i].next;
      const contentEnd = lines[close].start;
      blocks.push({
        start: lines[i].start,
        end: lines[close].start + lines[close].text.length,
        contentStart,
        contentEnd,
        content: note.slice(contentStart, contentEnd),
      });
    }
    i = close + 1;
  }
  return blocks;
}

export function findBlockWithId(note: string, id: string): BlockLocation | null {
  for (const block of findCredsBlocks(note)) {
    const { entries } = parseCredsBlock(block.content);
    if (entries.some((e) => e.type === "credential" && e.id === id)) return block;
  }
  return null;
}

/** 0-based line number where the note's first creds block starts, or null. */
export function firstCredsBlockLine(note: string): number | null {
  const first = findCredsBlocks(note)[0];
  if (!first) return null;
  let line = 0;
  for (let i = 0; i < first.start; i++) if (note.charCodeAt(i) === 10) line++;
  return line;
}
