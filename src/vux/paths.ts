import path from "node:path";

import type { FileScope } from "../contracts";
import { inNodeModules, inVux } from "../shared/query";

/**
 * Everything this package knows about the *layout* of the installed vux package
 * lives here, so that a layout change upstream is one file to fix.
 */

/** Absolute path to the installed vux package, resolved from the project root. */
export function getVuxRoot(root: string): string {
  return path.resolve(root, "node_modules", "vux");
}

/** Absolute path to a file inside the installed vux package. */
export function vuxPath(root: string, ...segments: string[]): string {
  return path.join(getVuxRoot(root), ...segments);
}

/**
 * Vite hands ids to plugins with whichever separator the platform and the
 * calling plugin happened to produce; every matcher below assumes `/`.
 */
export function normalizePath(id: string): string {
  return id.split("\\").join("/");
}

const VUX_COMPONENT_RE = /vux\/src\/components\/([^/]+)\//;

/**
 * Component directory name for a file inside a vux component, e.g.
 * `.../vux/src/components/actionsheet/index.vue` -> `actionsheet`.
 *
 * Doubles as the i18n key prefix (`vux.actionsheet.cancel`), which is why it is
 * anchored on `vux/src/components`: an app's own `src/components/foo/Button.vue`
 * must not pick up a component name.
 */
export function getComponentName(filename: string): string | undefined {
  return VUX_COMPONENT_RE.exec(normalizePath(filename))?.[1];
}

/** The only ownership predicate the transforms are allowed to use. */
export function scopeOf(filename: string): FileScope {
  const normalized = normalizePath(filename);

  return {
    inNodeModules: inNodeModules(normalized),
    inVuxPackage: inVux(normalized),
    component: getComponentName(normalized),
  };
}
