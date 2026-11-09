import { removeTag, reserveTag } from "../../shared/dom";
import type { BlockTransform } from "../../contracts";
import type { Config } from "../../types";

/**
 * Strips the branch of a template that does not apply to the current rendering
 * mode, using Vue 2's `<v-ssr>` / `<v-no-ssr>` tags.
 */
export function createSsrTransform(config: Config): BlockTransform {
  // SSR builds keep `<v-ssr>` and drop `<v-no-ssr>`; client-side is reversed.
  const [remove, reserve] = config.ssr ? ["v-no-ssr", "v-ssr"] : ["v-ssr", "v-no-ssr"];

  return (block) => {
    const content = reserveTag(removeTag(block.content, remove), reserve);
    return content === block.content ? undefined : { content };
  };
}
