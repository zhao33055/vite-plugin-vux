import path from "node:path";

import { exists, readDependencyFile } from "./utils/fs";
import type { BlockTransform } from "./contracts";
import { patchTemplate } from "./template-patch";
import type { Config } from "./types";

/**
 * `<x-icon>` has no runtime implementation: `vux/src/components/x-icon/` ships
 * a `metas.yml` and nothing else, and the name is absent from `map.json`. The
 * tag only works because vux-loader replaces it with inline SVG markup, which is
 * what this transform does - in the app's templates as well as in vux's own.
 */

const X_ICON_RE = /<x-icon\b([^>]*?)\/>|<x-icon\b([^>]*?)>(?:[\s\S]*?<\/x-icon>)?/;

export interface ParsedAttrs {
  [key: string]: string;
}

/**
 * Parses an HTML attribute list.
 *
 * Returns an empty object when there are no attributes - the previous
 * implementation called `.map` on a `null` `String#match` result and threw for
 * `<x-icon></x-icon>`.
 */
export function parseAttributes(source: string): ParsedAttrs {
  const attrs: ParsedAttrs = {};
  const re = /([\w:.\-@!#]+)(?:\s*=\s*"([^"]*)")?/g;

  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const [, rawName, value = ""] = match;
    // vux binds native listeners with `v-on:click.native`; the modifier is
    // meaningless once the icon is plain markup.
    const name = rawName.replace(/\.native$/, "");
    attrs[name] = value;
  }

  return attrs;
}

/**
 * Inlines every static `<x-icon type="...">` occurrence.
 *
 * Icons whose `type` is bound (`:type="foo"`) cannot be resolved at build time
 * and are left untouched so the runtime component can still handle them.
 */
export function inlineXIcon(
  content: string,
  loadSvg: (type: string) => string | null
): string {
  return patchTemplate(content, [
    {
      pattern: X_ICON_RE,
      replace: (match, [selfClosingAttrs, pairedAttrs]) => {
        const attrs = parseAttributes((selfClosingAttrs ?? pairedAttrs ?? "").trim());

        // A bound `:type` / `v-bind:type` is a runtime value - keep the component.
        if (
          attrs.type === undefined ||
          attrs[":type"] !== undefined ||
          attrs["v-bind:type"] !== undefined
        ) {
          return match;
        }

        const svg = loadSvg(attrs.type);
        if (svg === null) return match;

        const size = attrs.size || "24";
        const className = attrs.class
          ? `vux-x-icon vux-x-icon-${attrs.type} ${attrs.class}`
          : `vux-x-icon vux-x-icon-${attrs.type}`;

        const extraAttrs = Object.entries(attrs)
          .filter(
            ([key]) =>
              // `type` and `size` select the icon; they are not SVG attributes and
              // must not end up on the emitted element.
              key !== "class" &&
              key !== "size" &&
              key !== "type" &&
              !key.startsWith(":") &&
              !key.startsWith("v-bind:")
          )
          .map(([key, value]) => ` ${key}="${value}"`)
          .join("");

        return svg
          .replace('width="512"', `width="${size}"`)
          .replace('height="512"', `height="${size}"`)
          .replace("<svg", `<svg class="${className}"${extraAttrs}`);
      },
    },
  ]);
}

/** Reads an icon from the installed vux package, warning once per missing name. */
function createIconLoader(config: Config): (type: string) => string | null {
  const iconsDir = path.resolve(config.root, "node_modules", "vux", "src", "icons");
  const missing = new Set<string>();

  return (type) => {
    const svgPath = path.resolve(iconsDir, `${type}.svg`);

    if (!exists(svgPath)) {
      if (!missing.has(type)) {
        missing.add(type);
        console.warn(
          `[vite-plugin-vux] vux icon "${type}" not found in ${iconsDir}, leaving <x-icon> as-is.`
        );
      }
      return null;
    }

    return readDependencyFile(svgPath);
  };
}

export function createXiconTransform(config: Config): BlockTransform {
  const loadSvg = createIconLoader(config);

  // No `scope` check on purpose: an un-inlined `<x-icon>` renders nothing at
  // runtime no matter whose template it is in.
  return (block) => {
    const content = inlineXIcon(block.content, loadSvg);
    return content === block.content ? undefined : { content };
  };
}
