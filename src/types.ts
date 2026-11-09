import type { Logger } from "./shared/logger";

/**
 * Plugin option types.
 *
 * Note: `VuxLoaderPlugin` here is NOT a Vite plugin. These are transform
 * descriptors modelled after vux-loader's plugin objects (`less-theme`,
 * `style-parser`, `i18n`). They were previously typed as Vite's `Plugin[]`,
 * which silently allowed mismatches between what was declared and what the
 * transforms read - and named `VuxPlugin`, which read as "a plugin contributed
 * by this package", which is what the four objects `vux()` returns are.
 */

export type VuxPluginName = "less-theme" | "style-parser" | "i18n";

export interface VuxLessThemePlugin {
  name: "less-theme";
  /** Path to a less file holding theme variable overrides. */
  path: string;
}

export interface VuxStyleParserPlugin {
  name: "style-parser";
  /** Rewrites the content of `<style lang="less">` blocks. */
  fn: (code: string) => string;
}

export interface VuxI18nPlugin {
  name: "i18n";
  /**
   * Legacy vux-loader naming, kept for compatibility:
   * `vuxStaticReplace: false` means i18n is resolved at runtime.
   */
  vuxStaticReplace?: boolean;
  /** Locale used to resolve `vux.*` keys inside the vux package itself. */
  vuxLocale?: string;
  /** Function name used inside vux templates. Defaults to `$t`. */
  vuxFunctionName?: string;
  /**
   * Accepted for vux-loader compatibility, with no effect under Vite: user
   * strings are left to vue-i18n. A config that sets one of these four gets a
   * warning at startup.
   */
  functionName?: string;
  /** See `functionName`. */
  localeList?: string[];
  /** See `functionName`. */
  staticTranslations?: Record<string, Record<string, string>>;
  /** See `functionName`. */
  staticReplace?: boolean;
}

export type VuxLoaderPlugin = VuxLessThemePlugin | VuxStyleParserPlugin | VuxI18nPlugin;

export interface VuxOptions {
  /** Enable SSR specific template handling. */
  ssr?: boolean;
  plugins?: VuxLoaderPlugin[];
}

/**
 * Options after defaults are applied; every field the transforms rely on.
 *
 * Only the options the plugin actually implements appear here. The remaining
 * `VuxI18nPlugin` fields exist for vux-loader config compatibility and are
 * reported as unsupported instead.
 */
export interface ResolvedI18nOptions {
  /** `true` when translations are left to vue-i18n at runtime. */
  dynamic: boolean;
  locale: string;
  /** Name of the translation function inside vux's templates. */
  vuxFunctionName: string;
}

export interface Config {
  root: string;
  ssr: boolean;
  componentMap: Record<string, string>;
  plugins: VuxLoaderPlugin[];
  /**
   * Sink for everything a module wants to say during a build.
   *
   * Carried on the config rather than reached for as a global, so that one
   * build has one place its messages land - and so a test can hand a transform
   * somewhere to write instead of replacing `console`.
   */
  logger: Logger;
}

/**
 * Narrowed view of a file id after splitting off the query string.
 *
 * Vue sub-requests carry flags without a value (`...&lang.css&scoped`), which
 * `URLSearchParams` surfaces as an empty-string key, hence the index signature.
 */
export interface RequestQuery {
  vue?: boolean;
  raw?: boolean;
  scoped?: boolean;
  type?: "script" | "template" | "style" | "custom";
  index?: number;
  [flag: string]: string | number | boolean | undefined;
}
