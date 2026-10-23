/**
 * Remembers where notes moved to, so a form or block opened before a move still writes to the
 * right file.
 */
export class PathTracker {
  private moves = new Map<string, string>();

  renamed(oldPath: string, newPath: string): void {
    this.moves.delete(newPath);
    if (oldPath !== newPath) this.moves.set(oldPath, newPath);
  }

  /** A new file took this path; older moves away from it no longer apply. */
  created(path: string): void {
    this.moves.delete(path);
  }

  current(path: string): string {
    let p = path;
    const seen = new Set<string>();
    while (this.moves.has(p) && !seen.has(p)) {
      seen.add(p);
      p = this.moves.get(p)!;
    }
    return p;
  }
}
