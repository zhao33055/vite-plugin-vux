import { getAttrs, getFileName, type Block, type TransFormPlugin } from "./compiler";
import type { Config } from "./types";

/**
 * Some vux templates carry a `lang` attribute (e.g. `pug`) that Vite has no
 * loader for. The template is already normalised by the time it reaches us, so
 * the attribute is dropped to stop downstream plugins hunting for that loader.
 */
export function createTemplateAttrsTransformPlugin(
  name: string,
  _config: Config
): TransFormPlugin {
  return {
    name,
    fn: (template: Block) => {
      if (!getFileName(template).includes("node_modules")) return;

      const attrs = getAttrs(template);
      if (!attrs.lang) return;

      delete attrs.lang;
      return template;
    },
  };
}
