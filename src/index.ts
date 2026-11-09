import type { Plugin } from "vite";

import { buildVuxPlugins } from "./plugin";
import type { VuxOptions } from "./types";

/**
 * Public surface of `vite-plugin-vux`.
 *
 * Deliberately thin: this entry re-exports the plugin factory and the option
 * types, and nothing else. The layers behind it are -
 *
 * ```text
 *   plugin.ts    the four Vite plugins: which hook, when, on which file
 *   context.ts   the project's inputs, resolved once against Vite's root
 *   sfc/         the raw-.vue pipeline: parse, transforms in order, re-emit
 *   code/        JavaScript-to-JavaScript transforms (auto-import, require hoisting)
 *   vux/         everything that knows how the vux package is laid out
 *   shared/      filesystem, path and markup helpers with no knowledge of either
 * ```
 *
 * `code/` is pure: no filesystem, no Vite, a string in and a string out. `sfc/`
 * is pure except for the two transforms that need data from the vux package
 * itself - the i18n one reads its locale table, the x-icon one its SVG files -
 * and both go through `shared/fs` rather than opening a file directly. Every
 * other decision in `sfc/` is made from the block's own text.
 *
 * Nothing below this file writes to a stream of its own accord: warnings go to
 * the `Logger` the build was created with, which defaults to the console. Use
 * `buildVuxPlugins` instead of the default export to choose somewhere else.
 */
export default function vux(options: VuxOptions = {}): Plugin[] {
  return buildVuxPlugins(options);
}

export { buildVuxPlugins } from "./plugin";
export { createVuxContext, type VuxContext } from "./context";
export type { Logger } from "./shared/logger";

export type {
  VuxOptions,
  VuxLoaderPlugin,
  VuxPluginName,
  VuxI18nPlugin,
  VuxLessThemePlugin,
  VuxStyleParserPlugin,
} from "./types";
