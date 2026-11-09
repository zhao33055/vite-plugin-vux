import { removeTag, reserveTag } from "./dom";
import { getContent, type Block, type TransFormPlugin } from "./compiler";
import type { Config } from "./types";

/**
 * Strips the branch of a template that does not apply to the current rendering
 * mode, using Vue 2's `<v-ssr>` / `<v-no-ssr>` tags.
 */
export function createSsrTransformPlugin(name: string, config: Config): TransFormPlugin {
  const { ssr } = config;

  return {
    name,
    fn: (block: Block) => {
      // SSR builds keep `<v-ssr>` and drop `<v-no-ssr>`; client-side is reversed.
      const [remove, reserve] = ssr ? ["v-no-ssr", "v-ssr"] : ["v-ssr", "v-no-ssr"];

      block.content = reserveTag(removeTag(getContent(block), remove), reserve);
      return block;
    },
  };
}
