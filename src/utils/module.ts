import path from "node:path";
import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);

export function tryRequire<T = unknown>(id: string, from?: string): T | undefined {
  try {
    return from ? _require(_require.resolve(id, { paths: [from] })) : _require(id);
  } catch {
    return undefined;
  }
}

/** Absolute path to the installed vux package, resolved from the project root. */
export function getVuxRoot(root: string): string {
  return path.resolve(root, "node_modules", "vux");
}

/** Absolute path to a file inside the installed vux package. */
export function vuxPath(root: string, ...segments: string[]): string {
  return path.join(getVuxRoot(root), ...segments);
}
