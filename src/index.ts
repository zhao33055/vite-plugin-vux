import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createFilter, type Plugin } from "vite";

import type { Config, VuxI18nPlugin, VuxOptions } from "./types";
import {
  compileVue,
  generateVue,
  resolveCompiler,
  transformCustomBlocks,
  transformScript,
  transformStyles,
  transformTemplate,
  type SfcCompiler,
} from "./compiler";
import type { BlockTransform } from "./contracts";
import { normalizePath, scopeOf } from "./vux/paths";
import {
  inNodeModules,
  inVux,
  isCompiledSfc,
  isScriptLike,
  parseRequest,
} from "./utils/query";
import { getComponentMap, getStylesDir, getThemeVariables } from "./vuxApi";
import { createStyleTransform } from "./style";
import { createSsrTransform } from "./ssr";
import { createTemplateAttrsTransform } from "./template-attrs";
import { createXiconTransform } from "./icon";
import { createI18nCustomBlockTransform, createI18nTransform } from "./i18n";
import { transformVuxImport } from "./transforms/auto-import";
import { patchBareComponentImports, patchVuxSource } from "./transforms/vux-patches";

export type {
  VuxOptions,
  VuxPlugin,
  VuxPluginName,
  VuxI18nPlugin,
  VuxLessThemePlugin,
  VuxStyleParserPlugin,
} from "./types";

const pluginDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * vux's scroller imports `vux-xscroll`, which only ships UMD builds. A
 * pre-bundled ESM copy ships with this plugin and is exposed through the virtual
 * modules below, so vux's own import statements are never rewritten and no
 * absolute filesystem path leaks into the emitted bundle.
 */
const XSCROLL_VIRTUAL_PREFIX = "\0vux-xscroll:";
const XSCROLL_BUNDLE = path.resolve(pluginDir, "libs", "xscroll-bundle.js");
const XSCROLL_EXPORTS: Readonly<Record<string, string>> = {
  "vux-xscroll/build/cmd/xscroll.js": "XScroll",
  "vux-xscroll/build/cmd/plugins/pulldown": "Pulldown",
  "vux-xscroll/build/cmd/plugins/pullup": "Pullup",
};

/**
 * Dependencies vux reaches through dynamic or deeply nested paths, which Vite's
 * dependency scanner cannot always discover on its own.
 */
const OPTIMIZE_DEPS_INCLUDE = [
  "vux > lodash.debounce",
  "vux > array-filter",
  "vux > array-find",
  "vux > array-map",
  "vux > array-shuffle",
  "vux > autosize",
  "vux > countup.js",
  "vux > object-assign",
  "vux > x-photoswipe/dist/photoswipe",
  "vux > x-photoswipe/dist/photoswipe-ui-default",
  "vux > qr.js/lib/QRCode",
  "vux > qr.js/lib/ErrorCorrectLevel",
  "vux > shake.js",
  "vux > @antv/f2",
  "vux > vux-blazy",
  "vux > vanilla-masker",
  "vux > validator/lib/isEmail",
  "vux > validator/lib/isMobilePhone",
  "vux > big.js",
];

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
 * fixture root without starting Vite.
 */
export function createVuxContext(
  options: VuxOptions = {},
  root: string = process.cwd()
): VuxContext {
  const plugins = options.plugins ?? [];

  const config: Config = {
    root,
    ssr: !!options.ssr,
    componentMap: getComponentMap(root),
    plugins,
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

/** Minimal surface of the esbuild plugin API used below. */
interface EsbuildPlugin {
  name: string;
  setup(build: {
    onLoad(
      options: { filter: RegExp },
      callback: (args: {
        path: string;
      }) =>
        | Promise<{ contents: string; loader: "js" } | undefined>
        | { contents: string; loader: "js" }
        | undefined
    ): void;
  }): void;
}

/**
 * Fixes vux's extension-less component imports during dependency
 * pre-bundling, where Vite's own resolvers never run.
 */
function createPreBundlePatchPlugin(): EsbuildPlugin {
  return {
    name: "vite-plugin-vux:pre-bundle",
    setup(build) {
      // Deliberately permissive: path separators differ between esbuild
      // (native, so `\` on Windows) and the matcher, which normalises first.
      build.onLoad(
        { filter: /vux[/\\]src[/\\](plugins|components)[/\\]/ },
        async (args) => {
          const code = await fs.promises.readFile(args.path, "utf-8");
          const patched = patchBareComponentImports(normalizePath(args.path), code);

          return patched === null
            ? undefined
            : { contents: patched, loader: "js" as const };
        }
      );
    },
  };
}

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

function warnUnsupportedOptions(options: VuxOptions): void {
  const i18n = (options.plugins ?? []).find(
    (plugin): plugin is VuxI18nPlugin => plugin.name === "i18n"
  );
  if (!i18n) return;

  const used = UNSUPPORTED_I18N_OPTIONS.filter((key) => i18n[key] !== undefined);
  if (!used.length) return;

  console.warn(
    `[vite-plugin-vux] the i18n options ${used.join(", ")} have no effect under Vite: ` +
      `only the translation calls inside the vux package itself are statically replaced. ` +
      `Keep vue-i18n for your own strings.`
  );
}

export default function vux(options: VuxOptions = {}): Plugin[] {
  /**
   * Created on first use rather than here, because the project root is only
   * known once Vite calls `config()`. Everything the context reads from disk -
   * the component map, `vue/compiler-sfc`, the theme file - is resolved
   * relative to that root.
   */
  let ctx: VuxContext | undefined;
  const resolveContext = (root?: string): VuxContext => {
    ctx ??= createVuxContext(options, root ? path.resolve(root) : process.cwd());
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
      warnUnsupportedOptions(options);

      return {
        // Deliberately no `resolve.extensions`: see `RELATIVE_IMPORT_RE`.
        css: {
          preprocessorOptions: {
            less: {
              paths: [getStylesDir(config.root)],
              modifyVars: getThemeVariables(config.root, config.plugins),
            },
          },
        },
        optimizeDeps: {
          include: OPTIMIZE_DEPS_INCLUDE,
          esbuildOptions: {
            plugins: [createPreBundlePatchPlugin() as never],
          },
        },
      };
    },

    resolveId(id) {
      const exportName = XSCROLL_EXPORTS[id];
      if (!exportName) return null;

      return { id: `${XSCROLL_VIRTUAL_PREFIX}${id}`, moduleSideEffects: false };
    },

    load(id) {
      if (!id.startsWith(XSCROLL_VIRTUAL_PREFIX)) return null;

      const specifier = id.slice(XSCROLL_VIRTUAL_PREFIX.length);
      const exportName = XSCROLL_EXPORTS[specifier];
      if (!exportName) return null;

      // Expose the bundle's named export as default, so vux's own
      // `import XScroll from "vux-xscroll/..."` keeps working untouched.
      return `export { ${exportName} as default } from ${JSON.stringify(
        XSCROLL_BUNDLE
      )};`;
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

    // Vite types this hook with `this: void`, so the diagnostic goes to
    // console.warn like the rest of the plugin's build-time warnings.
    configResolved(resolved) {
      const names = resolved.plugins.map((plugin) => plugin.name);
      const own = names.indexOf("vite-plugin-vux:auto-import");
      const vue = names.findIndex((name) => name === "vite:vue2");

      // This hook has to run on the *compiled* SFC, which only exists once
      // @vitejs/plugin-vue2 has transformed it. Plugin array order decides that.
      if (vue !== -1 && own !== -1 && vue > own) {
        console.warn(
          `[vite-plugin-vux] vux() is registered before vue(), so component imports inside ` +
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
