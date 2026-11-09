import type { BlockTransform } from "./contracts";

/**
 * Some vux templates carry a `lang` attribute (e.g. `pug`) that Vite has no
 * loader for. The template is already normalised by the time it reaches us, so
 * the attribute is dropped to stop downstream plugins hunting for that loader.
 */
export function createTemplateAttrsTransform(): BlockTransform {
  return (block, scope) => {
    if (!scope.inNodeModules) return;
    if (!block.attrs.lang) return;

    const { lang: _lang, ...rest } = block.attrs;
    return { attrs: rest };
  };
}
