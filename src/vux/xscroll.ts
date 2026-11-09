import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * vux's scroller imports `vux-xscroll`, which only ships UMD builds. A
 * pre-bundled ESM copy ships with this plugin and is exposed through the virtual
 * modules below, so vux's own import statements are never rewritten and no
 * absolute filesystem path leaks into the emitted bundle.
 *
 * `pluginDir` is this module's own folder at runtime, which after bundling is
 * `dist/` - the directory the bundle is copied into by `rollup.config.ts`.
 */
const pluginDir = path.dirname(fileURLToPath(import.meta.url));

const VIRTUAL_PREFIX = "\0vux-xscroll:";
const BUNDLE = path.resolve(pluginDir, "libs", "xscroll-bundle.js");

/** Specifier -> the named export inside the bundle that stands in for it. */
const EXPORTS: Readonly<Record<string, string>> = {
  "vux-xscroll/build/cmd/xscroll.js": "XScroll",
  "vux-xscroll/build/cmd/plugins/pulldown": "Pulldown",
  "vux-xscroll/build/cmd/plugins/pullup": "Pullup",
};

/** Result shape of Vite's `resolveId`; declared here to keep vite out of this module. */
export interface XscrollResolution {
  id: string;
  moduleSideEffects: boolean;
}

export function resolveXscroll(id: string): XscrollResolution | null {
  if (!EXPORTS[id]) return null;

  // A `\0`-prefixed id: no filesystem path ever reaches the output, and nothing
  // on disk can collide with it.
  return { id: `${VIRTUAL_PREFIX}${id}`, moduleSideEffects: false };
}

export function loadXscroll(id: string): string | null {
  if (!id.startsWith(VIRTUAL_PREFIX)) return null;

  const specifier = id.slice(VIRTUAL_PREFIX.length);
  const exportName = EXPORTS[specifier];
  if (!exportName) return null;

  // Expose the bundle's named export as default, so vux's own
  // `import XScroll from "vux-xscroll/..."` keeps working untouched.
  return `export { ${exportName} as default } from ${JSON.stringify(BUNDLE)};`;
}
