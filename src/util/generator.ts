export interface GeneratorOptions {
  length: number;
  symbols: boolean;
  excludeAmbiguous: boolean;
}

export const AMBIGUOUS = "0O1lI|";

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
// No quotes, backslash, backtick or whitespace: they break YAML or shell pastes.
const SYMBOLS = "!#$%&()*+,-./:;<=>?@[]^_{|}~";

export function generatePassword(opts: GeneratorOptions): string {
  const strip = (set: string) => (opts.excludeAmbiguous ? [...set].filter((c) => !AMBIGUOUS.includes(c)).join("") : set);
  const classes = [LOWER, UPPER, DIGITS, ...(opts.symbols ? [SYMBOLS] : [])].map(strip);
  const all = classes.join("");
  const length = Math.max(opts.length, classes.length);

  const chars = classes.map((set) => set[randomIndex(set.length)]);
  while (chars.length < length) chars.push(all[randomIndex(all.length)]);

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** Unbiased random integer in [0, max) from Web Crypto. */
function randomIndex(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % max;
}
