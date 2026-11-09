import path from "node:path";

import yaml from "js-yaml";

import { exists, readFileSyncCached } from "./utils/fs";
import {
  getContent,
  getFileName,
  getType,
  type Block,
  type TransFormPlugin,
} from "./compiler";
import { findPlugin, type VuxI18nPlugin, type ResolvedI18nOptions } from "./vuxApi";
import type { Config } from "./types";

/**
 * Statically resolves the `$t()` calls inside vux's own templates.
 *
 * vux expects vue-i18n to be installed; this plugin removes that requirement
 * by baking the translations from `vux/src/locales/all.yml` into the templates.
 */

type LocaleTable = Record<string, Record<string, string>>;

/** `$t("key")` / `$t('key')`, with optional surrounding whitespace. */
const STATIC_T_RE = /\$t\(\s*(["'])((?:(?!\1)[^\\])*)\1\s*\)/g;

/** `vux/<component>.<key>` is flattened in all.yml, e.g. `vux.actionsheet.cancel`. */
const VUX_COMPONENT_RE = /vux[\\/]src[\\/]components[\\/]([^\\/]+)[\\/]/;

export function getComponentName(id: string): string | undefined {
  return VUX_COMPONENT_RE.exec(id)?.[1];
}

/**
 * Chooses a literal form that survives wherever the `$t()` call sat.
 *
 * Inside a bound attribute the value is already delimited by quotes, so
 * `:data-confirm-text="$t('confirm_text')"` must not become
 * `:data-confirm-text=""确定""` - the template parser then reports the tag as
 * text outside the root element and drops it. Inside `{{ }}` a double-quoted
 * expression is what we want.
 */
function translationLiteral(value: string, source: string, offset: number): string {
  const before = source.slice(0, offset);
  const openQuote = openAttributeQuote(before);

  if (openQuote === '"') return quoteJsString(value, "'");
  if (openQuote === "'") return quoteJsString(value, '"');
  return JSON.stringify(value);
}

/** The quote character of an attribute value `text` is currently inside. */
function openAttributeQuote(text: string): '"' | "'" | undefined {
  const tagStart = text.lastIndexOf("<");
  if (tagStart === -1 || text.lastIndexOf(">") > tagStart) return undefined;

  let open: '"' | "'" | undefined;
  for (let i = tagStart + 1; i < text.length; i++) {
    const char = text[i];
    if (open) {
      if (char === open) open = undefined;
    } else if (char === '"' || char === "'") {
      open = char;
    }
  }

  return open;
}

function quoteJsString(value: string, quote: '"' | "'"): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(new RegExp(quote, "g"), `\\${quote}`);

  return `${quote}${escaped}${quote}`;
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
  options: {
    /** Prefix for keys, e.g. `vux.actionsheet` produces `vux.actionsheet.cancel`. */
    prefix: string;
    lookup: (key: string) => string | undefined;
    onMissing?: (key: string) => void;
  }
): string {
  return content.replace(
    STATIC_T_RE,
    (match, _quote: string, key: string, offset: number, source: string) => {
      const fullKey = `${options.prefix}.${key}`;
      const translated = options.lookup(fullKey);

      if (translated === undefined) {
        options.onMissing?.(fullKey);
        return match;
      }

      return translationLiteral(translated, source, offset);
    }
  );
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

  const parsed = yaml.load(readFileSyncCached(localesPath));
  if (!parsed || typeof parsed !== "object") {
    console.warn(
      `[vite-plugin-vux] vux locales file is empty or malformed: ${localesPath}`
    );
    return null;
  }

  return parsed as LocaleTable;
}

/** Applies option defaults and maps the legacy vux-loader names. */
export function resolveI18nOptions(plugin?: VuxI18nPlugin): ResolvedI18nOptions {
  return {
    // vux-loader spells this `vuxStaticReplace`; static replacement is the
    // default, so `dynamic` is its negation.
    dynamic: plugin?.vuxStaticReplace === false,
    locale: plugin?.vuxLocale ?? "zh-CN",
    vuxFunctionName: plugin?.vuxFunctionName ?? "$t",
    functionName: plugin?.functionName ?? "$t",
    langs: plugin?.localeList ?? ["en", "zh-CN"],
    staticTranslations: plugin?.staticTranslations ?? {},
    staticReplace: plugin?.staticReplace ?? false,
  };
}

export function createI18nTransformPluginFor$t(
  name: string,
  config: Config
): TransFormPlugin {
  const options = resolveI18nOptions(findPlugin<VuxI18nPlugin>(config.plugins, "i18n"));
  const locales = options.dynamic ? null : loadLocales(config.root);
  const warned = new Set<string>();

  const lookup = (key: string): string | undefined => locales?.[options.locale]?.[key];

  return {
    name,
    fn: (template: Block) => {
      if (!locales) return;

      const filename = getFileName(template);
      const component = getComponentName(filename);
      if (!component) return;

      template.content = resolveStaticTranslations(getContent(template), {
        prefix: `vux.${component}`,
        lookup,
        onMissing: (key) => {
          if (warned.has(key)) return;
          warned.add(key);
          console.warn(
            `[vite-plugin-vux] no "${options.locale}" translation for "${key}" in vux locales; left as a runtime lookup.`
          );
        },
      });

      return template;
    },
  };
}

/**
 * Drops `<i18n>` custom blocks from vux components: they are only meaningful to
 * `vue-i18n-loader`, which Vite never runs.
 *
 * `config` is unused here but kept so every block-transform factory shares one
 * signature.
 */
export function createI18nTransformPluginForCustomBlock(
  name: string,
  _config: Config
): TransFormPlugin {
  return {
    name,
    fn: (customBlock: Block) => {
      if (
        getFileName(customBlock).includes("node_modules") &&
        getType(customBlock) === "i18n"
      ) {
        customBlock.destroyed = true;
        return customBlock;
      }
    },
  };
}
