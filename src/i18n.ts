import path from "node:path";

import yaml from "js-yaml";

import { exists, readDependencyFile } from "./utils/fs";
import { escapeRegExp } from "./utils/regexp";
import type { BlockTransform } from "./contracts";
import { literalFor, patchTemplate } from "./template-patch";
import { findPlugin, type VuxI18nPlugin } from "./vuxApi";
import type { Config, ResolvedI18nOptions } from "./types";

/**
 * Statically resolves the `$t()` calls inside vux's own templates.
 *
 * vux expects vue-i18n to be installed; this plugin removes that requirement
 * by baking the translations from `vux/src/locales/all.yml` into the templates.
 * Only vux's strings are touched - an app's own `$t()` calls belong to
 * vue-i18n, and replacing them here would take the runtime locale away.
 */

type LocaleTable = Record<string, Record<string, string>>;

/**
 * Pattern for `fn("key")` / `fn('key')`, with optional surrounding whitespace.
 *
 * The guard in front rejects `x$t(` and, for a renamed function such as `t`,
 * the `$t(` it is a suffix of. It deliberately allows `.`, because
 * `this.$t('key')` is a call worth replacing.
 */
function translationCall(functionName: string): RegExp {
  return new RegExp(
    `(?<![\\w$])${escapeRegExp(functionName)}\\(\\s*(["'])((?:(?!\\1)[^\\\\])*)\\1\\s*\\)`
  );
}

export interface TranslationResolver {
  /** Prefix for keys, e.g. `vux.actionsheet` produces `vux.actionsheet.cancel`. */
  prefix: string;
  lookup: (key: string) => string | undefined;
  /** Name of the translation function; vux templates use `$t`. */
  functionName?: string;
  onMissing?: (key: string) => void;
}

/**
 * Replaces static `$t('key')` calls with their translated literal.
 *
 * Expressions such as `$t(item.label)` are deliberately left alone: they are
 * runtime lookups, and the previous implementation replaced them with the
 * literal text `item.label`, silently breaking those components.
 */
export function resolveStaticTranslations(
  content: string,
  options: TranslationResolver
): string {
  return patchTemplate(content, [
    {
      pattern: translationCall(options.functionName ?? "$t"),
      replace: (match, [, key], context) => {
        if (key === undefined) return match;

        const fullKey = `${options.prefix}.${key}`;
        const translated = options.lookup(fullKey);

        if (translated === undefined) {
          options.onMissing?.(fullKey);
          return match;
        }

        return literalFor(translated, context);
      },
    },
  ]);
}

function loadLocales(root: string): LocaleTable | null {
  const localesPath = path.resolve(
    root,
    "node_modules",
    "vux",
    "src",
    "locales",
    "all.yml"
  );

  if (!exists(localesPath)) {
    console.warn(
      `[vite-plugin-vux] vux locales not found at ${localesPath}; ` +
        `vux strings will be resolved at runtime instead.`
    );
    return null;
  }

  const parsed = yaml.load(readDependencyFile(localesPath));
  if (!parsed || typeof parsed !== "object") {
    console.warn(
      `[vite-plugin-vux] vux locales file is empty or malformed: ${localesPath}`
    );
    return null;
  }

  return parsed as LocaleTable;
}

/**
 * Applies option defaults and maps the legacy vux-loader names.
 *
 * The options with no counterpart under Vite (`functionName`, `localeList`,
 * `staticTranslations`, `staticReplace`) are deliberately absent: they are
 * reported by `warnUnsupportedOptions` in `./index` instead of being resolved
 * into values nothing reads.
 */
export function resolveI18nOptions(plugin?: VuxI18nPlugin): ResolvedI18nOptions {
  return {
    // vux-loader spells this `vuxStaticReplace`; static replacement is the
    // default, so `dynamic` is its negation.
    dynamic: plugin?.vuxStaticReplace === false,
    locale: plugin?.vuxLocale ?? "zh-CN",
    vuxFunctionName: plugin?.vuxFunctionName ?? "$t",
  };
}

export function createI18nTransform(config: Config): BlockTransform {
  const options = resolveI18nOptions(findPlugin<VuxI18nPlugin>(config.plugins, "i18n"));
  const locales = options.dynamic ? null : loadLocales(config.root);
  const warned = new Set<string>();

  const lookup = (key: string): string | undefined => locales?.[options.locale]?.[key];

  return (block, scope) => {
    // `scope.component` is only set for a file inside `vux/src/components`, so
    // an app's templates keep using vue-i18n, which is the point.
    if (!locales || !scope.component) return;

    const content = resolveStaticTranslations(block.content, {
      prefix: `vux.${scope.component}`,
      functionName: options.vuxFunctionName,
      lookup,
      onMissing: (key) => {
        if (warned.has(key)) return;
        warned.add(key);
        console.warn(
          `[vite-plugin-vux] no "${options.locale}" translation for "${key}" in vux locales; left as a runtime lookup.`
        );
      },
    });

    return content === block.content ? undefined : { content };
  };
}

/**
 * Drops `<i18n>` custom blocks from vux components: they are only meaningful to
 * `vue-i18n-loader`, which Vite never runs.
 */
export function createI18nCustomBlockTransform(): BlockTransform {
  return (block, scope) => {
    if (!scope.inNodeModules || block.type !== "i18n") return;
    return { drop: true };
  };
}
