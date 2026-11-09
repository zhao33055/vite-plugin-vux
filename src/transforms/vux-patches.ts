import { escapeRegExp } from "../utils/regexp";
import { liftRequireImports } from "./cjs-to-esm";

/**
 * Workarounds for quirks in the vux package source.
 *
 * vux ships `src/` as authored rather than compiled, which leaves a few things
 * Vite cannot consume directly. Everything here is pattern-conditional: when a
 * future vux release fixes a quirk upstream, the corresponding patch stops
 * matching instead of corrupting the file.
 *
 * Verified against vux 2.9.x and 2.11.1:
 *  - bare `../../components/x` imports: present in both, still required.
 *  - CommonJS `require()`: gone in 2.11.1, handled for older releases.
 */

/**
 * vux imports its own components without an extension, e.g.
 * `import LoadingComponent from '../../components/loading'`. Vite does not
 * resolve that to `index.vue`, so the specifier is made explicit.
 */
export const BARE_COMPONENT_IMPORTS: ReadonlyArray<{
  file: RegExp;
  specifier: string;
}> = [
  {
    file: /vux\/src\/plugins\/loading\/index\.js$/,
    specifier: "../../components/loading",
  },
  {
    file: /vux\/src\/plugins\/confirm\/index\.js$/,
    specifier: "../../components/confirm",
  },
  { file: /vux\/src\/plugins\/alert\/util\.js$/, specifier: "../../components/alert" },
  { file: /vux\/src\/plugins\/toast\/index\.js$/, specifier: "../../components/toast" },
];

/**
 * Applies the extension fixes to a file's source.
 *
 * Only the esbuild pre-bundling hook needs this any more: rewriting specifiers
 * is the one trick available there, because esbuild resolves files itself. Under
 * Vite proper the same imports are handled by `vite-plugin-vux:resolver`, which
 * resolves the candidate path instead of editing the module's text.
 */
export function patchBareComponentImports(
  normalizedId: string,
  code: string
): string | null {
  let patched = code;

  for (const { file, specifier } of BARE_COMPONENT_IMPORTS) {
    if (!file.test(normalizedId)) continue;

    // Replace the quoted specifier only, never a substring of the code.
    patched = patched.replace(
      new RegExp(`(["'])${escapeRegExp(specifier)}\\1`),
      (_match, quote: string) => `${quote}${specifier}/index.vue${quote}`
    );
  }

  return patched === code ? null : patched;
}

export interface CommonJsPatchResult {
  code: string;
  /** `require()` calls left in the output, reported so the build can warn. */
  remainingRequires: number;
}

/**
 * Turns the `require()` leftovers in vux's mixed ESM/CommonJS sources into
 * imports.
 *
 * Only files that already contain ESM syntax are touched. Pure CommonJS files
 * are Vite's job - it converts them itself, and converting them twice produces
 * duplicate declarations.
 */
export function patchCommonJs(
  normalizedId: string,
  code: string
): CommonJsPatchResult | null {
  if (!normalizedId.includes("vux/src/") || !code.includes("require(")) {
    return null;
  }

  return liftRequireImports(code, normalizedId);
}

/**
 * Single entry point for the on-the-fly source patches.
 * Returns `null` when the module needs no changes.
 */
export function patchVuxSource(
  normalizedId: string,
  code: string,
  filename: string,
  onWarn?: (message: string) => void
): { code: string } | null {
  const commonJs = patchCommonJs(normalizedId, code);
  if (!commonJs) return null;

  if (commonJs.remainingRequires > 0) {
    onWarn?.(
      `${filename}: converted top-level require() calls to imports but ${commonJs.remainingRequires} remain inside function bodies; ` +
        `this vux file cannot be auto-converted and will likely fail at runtime.`
    );
  }

  return { code: commonJs.code };
}
