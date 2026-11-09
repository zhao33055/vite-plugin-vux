import fs from "node:fs";

import { patchBareComponentImports } from "../code/patches";
import { normalizePath } from "./paths";

/**
 * Everything this plugin adds so that Vite can consume the vux package as a
 * dependency: the hints for the scanner, and the esbuild hook that covers the
 * cases Vite's own resolvers cannot reach during pre-bundling.
 */

/**
 * Dependencies vux reaches through dynamic or deeply nested paths, which Vite's
 * dependency scanner cannot always discover on its own.
 */
const INCLUDE = [
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
 *
 * Under Vite proper the same imports are handled by `vite-plugin-vux:resolver`,
 * which resolves the candidate instead of editing the module's text; here
 * rewriting the specifier is the only trick available.
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
 * The `optimizeDeps` portion of the Vite config this plugin contributes.
 *
 * The return type is left to inference on purpose: this module does not import
 * Vite, and the `as never` below is what keeps the local esbuild-shaped plugin
 * compatible with the type Vite expects for that field.
 */
export function optimizeDepsConfig() {
  return {
    include: INCLUDE,
    esbuildOptions: {
      plugins: [createPreBundlePatchPlugin() as never],
    },
  };
}
