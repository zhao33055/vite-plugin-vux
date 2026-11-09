import path from "node:path";

import { createFilter, type Plugin } from "vite";

import { createVuxContext, type VuxContext } from "./context";
import { transformVuxImport } from "./code/auto-import";
import { patchVuxSource } from "./code/patches";
import { isCompiledSfc } from "./sfc/compiled";
import {
  compileVue,
  generateVue,
  transformCustomBlocks,
  transformScript,
  transformStyles,
  transformTemplate,
} from "./sfc/compiler";
import { createConsoleLogger, type Logger } from "./shared/logger";
import { inNodeModules, inVux, isScriptLike, parseRequest } from "./shared/query";
import { lessConfig } from "./vux/less-config";
import { normalizePath, scopeOf } from "./vux/paths";
import { optimizeDepsConfig } from "./vux/optimize-deps";
import { loadXscroll, resolveXscroll } from "./vux/xscroll";
import type { VuxI18nPlugin, VuxOptions } from "./types";

/**
 * The four Vite plugins this package installs, and only their wiring.
 *
 * Rules for this file: no filesystem reads (that is `./context` and `./vux/api`),
 * no string mashing (that is `./sfc` and `./code`), no knowledge of vux's layout
 * (that is `./vux`), and no `console` - a diagnostic either goes to the build's
 * `Logger` or, where Rollup hands the hook a plugin context, to `this.warn`.
 * Each hook decides whether it applies and delegates.
 */

/**
 * Relative imports inside the vux package have no `.vue` extension - vux was
 * authored for webpack, whose `resolve.extensions` covered that.
 *
 * The previous version added `.vue` to the app-wide `resolve.extensions`, which
 * also changes how *the host project's* own extension-less imports resolve. The
 * requirement is only ever true for importers inside vux, so it is expressed as
 * a resolver scoped to those, and Vite's defaults stay untouched.
 */
const RELATIVE_IMPORT_RE = /^\.{1,2}\//;

/**
 * Accepted for vux-loader compatibility, deliberately not implemented.
 *
 * Keeping them typed means a config written for vux-loader still compiles; a
 * config that actually *sets* one is asking for behaviour that will not happen,
 * which deserves a message rather than silence.
 *
 * `vuxLocale` and `vuxStaticReplace` are implemented, and so is
 * `vuxFunctionName` - the i18n transform matches the configured call instead of
 * hard-coding `$t`. The four below all describe work on the *app's* own strings,
 * which stays vue-i18n's job under Vite.
 */
const UNSUPPORTED_I18N_OPTIONS = [
  "functionName",
  "localeList",
  "staticTranslations",
  "staticReplace",
] as const;

function warnUnsupportedOptions(options: VuxOptions, logger: Logger): void {
  const i18n = (options.plugins ?? []).find(
    (plugin): plugin is VuxI18nPlugin => plugin.name === "i18n"
  );
  if (!i18n) return;

  const used = UNSUPPORTED_I18N_OPTIONS.filter((key) => i18n[key] !== undefined);
  if (!used.length) return;

  logger.warn(
    `the i18n options ${used.join(", ")} have no effect under Vite: ` +
      `only the translation calls inside the vux package itself are statically replaced. ` +
      `Keep vue-i18n for your own strings.`
  );
}

/**
 * @param logger where this build's diagnostics go. Defaults to the console; a
 *   caller embedding the plugin, or a test, hands it somewhere else and never
 *   has to touch the global.
 */
export function buildVuxPlugins(
  options: VuxOptions = {},
  logger: Logger = createConsoleLogger()
): Plugin[] {
  /**
   * Created on first use rather than here, because the project root is only
   * known once Vite calls `config()`. Everything the context reads from disk -
   * the component map, `vue/compiler-sfc`, the theme file - is resolved
   * relative to that root.
   */
  let ctx: VuxContext | undefined;
  const resolveContext = (root?: string): VuxContext => {
    ctx ??= createVuxContext(options, root ? path.resolve(root) : process.cwd(), logger);
    return ctx;
  };

  const vueFilter = createFilter(/\.vue$/);
  const warnedImports = new Set<string>();

  /** Rewrites the raw SFC so @vitejs/plugin-vue2 sees already-normalised blocks. */
  const sfcPlugin: Plugin = {
    name: "vite-plugin-vux:sfc",
    enforce: "pre",

    config(userConfig) {
      const { config } = resolveContext(userConfig.root);
      warnUnsupportedOptions(options, logger);

      return {
        // Deliberately no `resolve.extensions`: see `RELATIVE_IMPORT_RE`.
        css: lessConfig(config.root, config.plugins, logger),
        optimizeDeps: optimizeDepsConfig(),
      };
    },

    resolveId(id) {
      return resolveXscroll(id);
    },

    load(id) {
      return loadXscroll(id);
    },

    transform(code, id) {
      const { filename, query } = parseRequest(id);

      // Only the raw SFC is ours; `?vue&type=...` sub-requests belong to
      // @vitejs/plugin-vue2.
      if (!vueFilter(filename) || query.vue) return null;

      const context = resolveContext();
      const { template, script, styles, customBlocks } = compileVue(
        context.compiler,
        filename,
        code
      );

      // Decided once per file, for every block in it.
      const scope = scopeOf(filename);

      return generateVue(
        transformTemplate(template, context.templateTransforms, scope),
        // Scripts are re-emitted untouched: the component-import rewriting
        // happens on the compiled output, in the auto-import plugin.
        transformScript(script, [], scope),
        transformStyles(styles, context.styleTransforms, scope),
        transformCustomBlocks(customBlocks, context.customBlockTransforms, scope)
      );
    },
  };

  /** Applies the source-level workarounds the vux package still needs. */
  const patchPlugin: Plugin = {
    name: "vite-plugin-vux:patches",
    enforce: "pre",

    transform(code, id) {
      const { filename } = parseRequest(id);
      if (!isScriptLike(id) || !inVux(filename)) return null;

      return patchVuxSource(normalizePath(filename), code, filename, (message) =>
        this.warn(message)
      );
    },
  };

  /**
   * Resolves the extension-less component imports inside the vux package
   * (`import '../inline-desc'`) to `…/index.vue` or `….vue`.
   *
   * `post` so that this is consulted only once Vite and every other plugin have
   * already declined, and gated on the *importer* being inside vux: an
   * app-wide `.vue` extension would silently change how the host project's own
   * `./x` imports resolve.
   */
  const resolverPlugin: Plugin = {
    name: "vite-plugin-vux:resolver",
    enforce: "post",

    async resolveId(source, importer, options) {
      if (!importer || !RELATIVE_IMPORT_RE.test(source)) return null;
      if (!inVux(normalizePath(parseRequest(importer).filename))) return null;

      for (const candidate of [`${source}/index.vue`, `${source}.vue`]) {
        const resolved = await this.resolve(candidate, importer, {
          ...options,
          skipSelf: true,
        });
        if (resolved) return resolved;
      }

      return null;
    },
  };

  /** `import { X } from "vux"` -> one default import per component. */
  const autoImportPlugin: Plugin = {
    name: "vite-plugin-vux:auto-import",

    // Vite types this hook with `this: void`, so there is no `this.warn` to use
    // and the build's logger is the next best thing.
    configResolved(resolved) {
      const names = resolved.plugins.map((plugin) => plugin.name);
      const own = names.indexOf("vite-plugin-vux:auto-import");
      const vue = names.findIndex((name) => name === "vite:vue2");

      // This hook has to run on the *compiled* SFC, which only exists once
      // @vitejs/plugin-vue2 has transformed it. Plugin array order decides that.
      if (vue !== -1 && own !== -1 && vue > own) {
        logger.warn(
          `vux() is registered before vue(), so component imports inside ` +
            `.vue files are not rewritten. Put vue() first: plugins: [vue(), vux()].`
        );
      }
    },

    transform(code, id) {
      const { filename } = parseRequest(id);

      // Assets and the vux package itself are irrelevant here. `.vue` modules
      // count because their code is JavaScript by now - see `isCompiledSfc`.
      if (inNodeModules(id)) return null;
      if (!isScriptLike(id) && !isCompiledSfc(id, code)) return null;

      const result = transformVuxImport(code, resolveContext().config.componentMap, {
        filename,
        onUnknown: (name) => {
          if (warnedImports.has(name)) return;
          warnedImports.add(name);
          this.warn(
            `"${name}" is not a known vux component; the import was left untouched. (${filename})`
          );
        },
      });

      if (!result) return null;
      return { code: result.code, map: result.map };
    },
  };

  return [sfcPlugin, patchPlugin, resolverPlugin, autoImportPlugin];
}
