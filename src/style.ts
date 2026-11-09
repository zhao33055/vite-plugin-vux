import { getContent, type Block, type TransFormPlugin } from "./compiler";
import { findPlugin, type VuxStyleParserPlugin } from "./vuxApi";
import type { Config } from "./types";

/**
 * Lets the user post-process `<style lang="less">` content before less
 * compilation, mirroring vux-loader's `style-parser` plugin.
 */
export function createStyleTransformPlugin(
  name: string,
  config: Config
): TransFormPlugin {
  const styleParser = findPlugin<VuxStyleParserPlugin>(config.plugins, "style-parser");

  return {
    name,
    fn: (styleBlock: Block) => {
      if (
        styleBlock.attrs.lang !== "less" ||
        !styleParser ||
        typeof styleParser.fn !== "function"
      ) {
        return styleBlock;
      }

      styleBlock.content = styleParser.fn(getContent(styleBlock));
      return styleBlock;
    },
  };
}
