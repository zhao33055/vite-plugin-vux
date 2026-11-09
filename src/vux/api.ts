import path from "node:path";

import stripCssComments from "strip-css-comments";

import { tryRequire } from "../shared/module";
import { exists, readSourceFile } from "../shared/fs";
import { vuxPath } from "./paths";
import type { VuxPlugin, VuxPluginName, VuxLessThemePlugin } from "../types";

/**
 * Reads the data the plugin needs from the installed vux package and from the
 * user's plugin options (`less-theme`, `style-parser`, `i18n`).
 *
 * Everything in here reads the project's own inputs: the option files a user
 * points at (`less-theme`, `style-parser`) and the component map. The sfc
 * transforms that read the package's *data* files - locales, icons - live with
 * the transform that uses them and share `shared/fs`, because what they read is
 * an implementation detail of that transform, not of the project's setup.
 */

export type {
  VuxPlugin,
  VuxPluginName,
  VuxI18nPlugin,
  VuxLessThemePlugin,
  VuxStyleParserPlugin,
  ResolvedI18nOptions,
} from "../types";

export function findPlugin<T extends VuxPlugin = VuxPlugin>(
  plugins: VuxPlugin[],
  name: VuxPluginName
): T | undefined {
  return plugins.find((plugin) => plugin.name === name) as T | undefined;
}

/**
 * Loads `vux/src/components/map.json`, the canonical component-name to path
 * table that powers on-demand imports.
 */
export function getComponentMap(root: string): Record<string, string> {
  const mapPath = vuxPath(root, "src", "components", "map.json");

  if (!exists(mapPath)) {
    throw new Error(
      `[vite-plugin-vux] Cannot find vux component map at ${mapPath}.\n` +
        `Is vux installed? Try: pnpm add vux`
    );
  }

  const map = tryRequire<Record<string, string>>(mapPath);
  if (!map) {
    throw new Error(`[vite-plugin-vux] Failed to load vux component map at ${mapPath}.`);
  }

  return map;
}

/**
 * Directory holding vux's less variables.
 *
 * This is handed to `css.preprocessorOptions.less.paths`, which expects
 * directories to search - the previous version returned the path to
 * `variable.less` itself, which is not a directory.
 */
export function getStylesDir(root: string): string {
  return vuxPath(root, "src", "styles");
}

const VALID_VARIABLE_NAME = /^[A-Za-z0-9_-]+$/;

function trim(value: string | undefined): string {
  return value ? value.replace(/^\s+|\s+$/g, "") : "";
}

/**
 * Extracts `@name: value;` declarations from a less file, following
 * `@import` statements, for use as less `modifyVars`.
 */
export function getVariables(filePath: string): Record<string, string> {
  const variables: Record<string, string> = {};

  if (!exists(filePath)) {
    throw new Error(`[vite-plugin-vux] theme file not found: ${filePath}`);
  }

  // The theme file belongs to the app: it is edited while `vite dev` runs, so
  // this read must not go through the dependency cache.
  stripCssComments(readSourceFile(filePath), { preserve: false })
    .split("\n")
    .forEach((rawLine) => {
      let line = trim(rawLine);
      if (!line) return;

      // Only `@name: value;` lines and `@import` statements are meaningful here.
      // Without this guard, a declaration inside a rule body (e.g. a stray
      // `color: red;`) would silently overwrite the `@color` theme variable.
      if (!line.startsWith("@")) return;

      const commentAt = line.indexOf("//");
      if (commentAt > 0) line = trim(line.slice(0, commentAt));

      const pair = line.split(":");

      // A line without a `:` is either noise or an `@import` to recurse into.
      if (pair.length < 2) {
        if (!/@import/.test(pair[0] ?? "")) return;

        const imported = pair[0]
          .replace(/;/g, "")
          .replace("@import", "")
          .replace(/['"]/g, "")
          .replace(/\s+/g, "")
          .trim();

        Object.assign(
          variables,
          getVariables(path.resolve(path.dirname(filePath), imported))
        );
        return;
      }

      const key = trim(pair[0].replace(/\r/g, "").replace("@", ""));
      if (!key) return;

      if (!VALID_VARIABLE_NAME.test(key)) {
        console.warn(`[vite-plugin-vux] ignoring suspicious theme variable name: ${key}`);
        return;
      }

      variables[key] = pair[1].replace(/;/g, "").replace(/\r/g, "").trim();
    });

  return variables;
}

export function getThemeVariables(
  root: string,
  plugins: VuxPlugin[]
): Record<string, string> {
  const theme = findPlugin<VuxLessThemePlugin>(plugins, "less-theme");
  if (!theme) return {};

  return getVariables(path.resolve(root, theme.path));
}
