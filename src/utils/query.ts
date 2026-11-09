import type { RequestQuery } from "../types";

export function parseRequest(id: string) {
  const [filename, rawQuery] = id.split("?", 2);
  const query = Object.fromEntries(new URLSearchParams(rawQuery)) as RequestQuery;

  if (query.vue != null) {
    query.vue = true;
  }
  if (query.index != null) {
    query.index = Number(query.index);
  }
  if (query.raw != null) {
    query.raw = true;
  }
  if (query.scoped != null) {
    query.scoped = true;
  }

  return { filename, query };
}

/** Path separators are inconsistent across Vite versions and platforms. */
const NODE_MODULES_RE = /(^|[\\/])node_modules[\\/]/;

export function inNodeModules(id: string): boolean {
  return NODE_MODULES_RE.test(id);
}

const VUE_RE = /\.vue$/;
/** Matches `main.js` as well as Vue sub-requests such as `App.vue?vue&type=script&lang.js`. */
const SCRIPT_LIKE_RE = /\.(mjs|cjs|[jt]sx?)$/;

export function isVueFile(filename: string): boolean {
  return VUE_RE.test(filename);
}

export function isJavaScriptFile(filename: string): boolean {
  return SCRIPT_LIKE_RE.test(filename);
}

/**
 * A module whose code is JavaScript by the time later plugins see it.
 *
 * Vue sub-requests keep the `.vue` filename in front of the query, so they are
 * detected through the query instead of the extension.
 */
export function isScriptLike(id: string): boolean {
  const { filename, query } = parseRequest(id);
  return isJavaScriptFile(filename) || Boolean(query.vue);
}

/**
 * True for a `.vue` module whose code has already been compiled to JavaScript.
 *
 * `@vitejs/plugin-vue2` compiles the whole SFC into the module that keeps the
 * plain `App.vue` id, so no id-based test can tell that output from the raw
 * source. The code settles it: an SFC opens with a tag, JavaScript does not.
 *
 * Without this, component imports inside `.vue` files stay as one big
 * `import { ... } from "vux"`, and dev mode pulls in every component in the
 * library instead of the ones actually used.
 */
export function isCompiledSfc(id: string, code: string): boolean {
  const { filename } = parseRequest(id);
  return isVueFile(filename) && !/^\s*</.test(code);
}

const VUX_RE = /node_modules[\\/]vux[\\/]/;

/** True for modules that come from the installed vux package itself. */
export function inVux(id: string): boolean {
  return VUX_RE.test(id);
}
