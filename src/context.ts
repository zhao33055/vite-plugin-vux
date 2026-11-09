import { createConsoleLogger, type Logger } from "./shared/logger";
import type { BlockTransform } from "./contracts";
import { resolveCompiler, type SfcCompiler } from "./sfc/compiler";
import {
  createI18nCustomBlockTransform,
  createI18nTransform,
} from "./sfc/transforms/i18n";
import { createXiconTransform } from "./sfc/transforms/icon";
import { createSsrTransform } from "./sfc/transforms/ssr";
import { createStyleTransform } from "./sfc/transforms/style";
import { createTemplateAttrsTransform } from "./sfc/transforms/template-attrs";
import { getComponentMap } from "./vux/api";
import type { Config, VuxOptions } from "./types";

/**
 * The plugin's inputs, resolved once against the project root.
 *
 * This is the only module that assembles the pipeline, and the only place the
 * project root is turned into paths: the component map, `vue/compiler-sfc` and
 * the theme file are all read relative to the root Vite reports, so none of them
 * can be resolved at import time.
 */
export interface VuxContext {
  config: Config;
  compiler: SfcCompiler;
  /** One list per kind of block the SFC transform re-emits. */
  templateTransforms: BlockTransform[];
  styleTransforms: BlockTransform[];
  customBlockTransforms: BlockTransform[];
}

/**
 * Resolves everything that touches the filesystem.
 *
 * Kept separate from the plugin factory so tests can build a context against a
 * fixture root without starting Vite - and hand it somewhere to warn that is not
 * `console`.
 */
export function createVuxContext(
  options: VuxOptions = {},
  root: string = process.cwd(),
  logger: Logger = createConsoleLogger()
): VuxContext {
  const plugins = options.plugins ?? [];

  const config: Config = {
    root,
    ssr: !!options.ssr,
    componentMap: getComponentMap(root),
    plugins,
    logger,
  };

  return {
    config,
    compiler: resolveCompiler(root),
    templateTransforms: [
      createTemplateAttrsTransform(),
      createSsrTransform(config),
      createXiconTransform(config),
      createI18nTransform(config),
    ],
    styleTransforms: [createStyleTransform(config)],
    customBlockTransforms: [createI18nCustomBlockTransform()],
  };
}
