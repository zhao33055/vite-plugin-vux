import fs from "node:fs";

/**
 * Reads are split by *who owns the file*, because that decides whether a cached
 * copy can ever be wrong.
 *
 * Files inside `node_modules` are immutable for the lifetime of a dev server -
 * they are re-read only by reinstalling the package, which restarts the process.
 * Transform hooks run on every HMR round and several of them read the same SVG
 * icons and locale tables, so caching those is free correctness.
 *
 * Files owned by the app - the `less-theme` file above all - are edited while
 * `vite dev` is running. Caching them means a theme change silently does nothing
 * until the server is restarted, which is exactly how the previous version of
 * this module behaved.
 */
const dependencyCache = new Map<string, string>();

export function readDependencyFile(filePath: string): string {
  const cached = dependencyCache.get(filePath);
  if (cached !== undefined) return cached;

  const contents = fs.readFileSync(filePath, "utf-8");
  dependencyCache.set(filePath, contents);
  return contents;
}

/** Never cached: the user may have saved this file since the last read. */
export function readSourceFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

export function exists(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
