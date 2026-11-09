import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";

import { defineConfig } from "rollup";
import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";
import copy from "rollup-plugin-copy";

const isProd = process.env.NODE_ENV === "production";

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf-8")
) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> };

/**
 * Everything the plugin expects to find in the consumer's tree stays external.
 * Bundling these would duplicate Babel into the published package and break
 * `vue/compiler-sfc` resolution: the plugin must compile with the app's Vue.
 */
const external = [
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
];

export default defineConfig({
  external,
  input: "src/index.ts",
  output: [
    {
      file: "dist/index.js",
      format: "cjs",
      sourcemap: !isProd,
      // The entry exports a default plugin factory plus named helpers. Without
      // this, rollup emits `module.exports = exports` semantics that break
      // `require("vite-plugin-vux")` interop.
      exports: "named",
    },
    {
      file: "dist/index.mjs",
      format: "es",
      sourcemap: !isProd,
    },
  ],
  plugins: [
    typescript({
      tsconfig: "./tsconfig.json",
      declaration: true,
      declarationDir: "./dist",
      rootDir: "./src",
    }),
    // Minifying the dev/watch build makes plugin debugging needlessly hard.
    isProd && terser(),
    copy({
      targets: [{ src: "src/libs/**/*", dest: "dist/libs" }],
    }),
  ].filter(Boolean),
});
