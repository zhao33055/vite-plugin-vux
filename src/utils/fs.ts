import fs from "node:fs";

/**
 * Synchronous read cache.
 *
 * Transform hooks run on every HMR round, and several of them read the same
 * immutable files out of the vux package (SVG icons, locale definitions).
 * Without this cache each `<x-icon>` occurrence hit the disk again.
 */
const cache = new Map<string, string>();

export function readFileSyncCached(filePath: string): string {
  const cached = cache.get(filePath);
  if (cached !== undefined) {
    return cached;
  }

  const contents = fs.readFileSync(filePath, "utf-8");
  cache.set(filePath, contents);
  return contents;
}

export function exists(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function clearReadCache(): void {
  cache.clear();
}
