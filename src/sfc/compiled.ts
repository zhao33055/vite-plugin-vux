import { isVueFile, parseRequest } from "../shared/query";

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
