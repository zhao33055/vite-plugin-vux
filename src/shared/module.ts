import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);

/**
 * Resolves a module through Node's resolver rather than through the plugin's own
 * dependency tree.
 *
 * This is how `vue/compiler-sfc` and `vux`'s `map.json` are read from the
 * consumer's project: the plugin must compile with the app's Vue, not with the
 * one it happened to be published against.
 */
export function tryRequire<T = unknown>(id: string, from?: string): T | undefined {
  try {
    return from ? _require(_require.resolve(id, { paths: [from] })) : _require(id);
  } catch {
    return undefined;
  }
}
