import type { BlockTransform } from "../../contracts";
import { findPlugin, type VuxStyleParserPlugin } from "../../vux/api";
import type { Config } from "../../types";

/**
 * Lets the user post-process `<style lang="less">` content before less
 * compilation, mirroring vux-loader's `style-parser` plugin.
 */
export function createStyleTransform(config: Config): BlockTransform {
  const styleParser = findPlugin<VuxStyleParserPlugin>(config.plugins, "style-parser");

  return (block) => {
    if (!styleParser || typeof styleParser.fn !== "function") return;
    if (block.attrs.lang !== "less") return;

    const content = styleParser.fn(block.content);
    return content === block.content ? undefined : { content };
  };
}
