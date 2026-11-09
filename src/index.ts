import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createFilter, type Plugin } from "vite";

import type { Config, VuxOptions } from "./types";
import {
  compileVue,
  generateVue,
  resolveCompiler,
  transformCustomBlocks,
  transformScript,
  transformStyles,
  transformTemplate,
  type SfcCompiler,
  type TransFormPlugin,
} from "./compiler";
import {
  inNodeModules,
  inVux,
  isCompiledSfc,
  isScriptLike,
  parseRequest,
} from "./utils/query";
import { getComponentMap, getStylesDir, getThemeVariables } from "./vuxApi";
import { createStyleTransformPlugin } from "./style";
import { createSsrTransformPlugin } from "./ssr";
import { createTemplateAttrsTransformPlugin } from "./template-attrs";
import { createXiconTransformPlugin } from "./icon";
import {
  createI18nTransformPluginForCustomBlock,
  createI18nTransformPluginFor$t,
} from "./i18n";
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
  templatePlugins: TransFormPlugin[];
  stylePlugins: TransFormPlugin[];
  customBlockPlugins: TransFormPlugin[];
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
    templatePlugins: [
      createTemplateAttrsTransformPlugin("template-attrs", config),
      createSsrTransformPlugin("ssr", config),
      createXiconTransformPlugin("x-icon", config),
      createI18nTransformPluginFor$t("i18n-t", config),
    ],
    stylePlugins: [createStyleTransformPlugin("style-parser", config)],
    customBlockPlugins: [
      createI18nTransformPluginForCustomBlock("i18n-custom-block", config),
    ],
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
          const patched = patchBareComponentImports(
            args.path.split("\\").join("/"),
            code
          );

          return patched === null
            ? undefined
            : { contents: patched, loader: "js" as const };
        }
      );
    },
  };
}

/**
 * Vite's own default `resolve.extensions`, plus `.vue`.
 *
 * The list has to be written out in full: assigning `[".js", ".vue"]` replaces
 * the defaults instead of extending them, which silently breaks extension-less
 * imports of `.ts`, `.tsx`, `.jsx` and `.json` in the host project.
 */
const RESOLVE_EXTENSIONS = [
  ".mjs",
  ".js",
  ".mts",
  ".ts",
  ".jsx",
  ".tsx",
  ".json",
  ".vue",
];

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

      return {
        resolve: {
          extensions: RESOLVE_EXTENSIONS,
        },
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

      return generateVue(
        transformTemplate(template, context.templatePlugins),
        transformScript(script),
        transformStyles(styles, context.stylePlugins),
        transformCustomBlocks(customBlocks, context.customBlockPlugins)
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

      return patchVuxSource(filename.split("\\").join("/"), code, filename, (message) =>
        this.warn(message)
      );
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

  return [sfcPlugin, patchPlugin, autoImportPlugin];
}
