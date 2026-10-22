export interface Space {
  name: string;
  folder: string;
}

export const DEFAULT_SPACES: Space[] = [{ name: "Infra", folder: "Infra" }];

/** Reads spaces from saved settings, converting the 0.1 single resourceFolder. */
export function migrateSpaces(data: { spaces?: Space[]; resourceFolder?: string }): Space[] {
  if (Array.isArray(data.spaces) && data.spaces.length > 0) return data.spaces;
  if (typeof data.resourceFolder === "string") {
    const folder = cleanFolder(data.resourceFolder);
    return [{ name: folder === "" ? "Vault" : folder.split("/").pop()!, folder }];
  }
  return DEFAULT_SPACES.map((s) => ({ ...s }));
}

/** The space whose folder holds this path; the longest folder wins. An empty folder is the vault root. */
export function spaceOf(path: string, spaces: Space[]): string | null {
  let best: Space | null = null;
  let bestLength = -1;
  for (const space of spaces) {
    const folder = cleanFolder(space.folder);
    if (folder !== "" && !path.startsWith(folder + "/")) continue;
    if (folder.length > bestLength) {
      best = space;
      bestLength = folder.length;
    }
  }
  return best?.name ?? null;
}

export function cleanFolder(folder: string): string {
  return folder.trim().replace(/^\/+|\/+$/g, "");
}
