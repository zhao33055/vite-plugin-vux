import type { SFCBlock, SFCDescriptor } from "vue/compiler-sfc";

import { tryRequire } from "./utils/module";

/**
 * A single SFC block, tagged with the file it came from so that transform
 * plugins can decide whether a block belongs to vux or to user code.
 */
export interface Block extends Omit<SFCBlock, "start" | "end"> {
  filename: string;
  /** Set by a plugin to drop the block from the generated output entirely. */
  destroyed?: boolean;
  /**
   * Source offsets. The parser always fills these in, but a block only needs
   * `type`, `content` and `attrs` to be re-serialised, so they stay optional.
   */
  start?: number;
  end?: number;
}

export interface TransFormPlugin {
  name: string;
  fn: (block: Block) => Block | void | null | undefined;
}

/** A parsed SFC descriptor, as produced by `vue/compiler-sfc`. */
export interface SfcCompiler {
  parse(options: {
    filename: string;
    source: string;
    sourceMap?: boolean;
  }): SFCDescriptor;
}

/**
 * Resolves `vue/compiler-sfc` from the user's project rather than from this
 * plugin's own dependencies, so the plugin always compiles with the same Vue
 * version the app uses.
 *
 * The compiler is returned to the caller instead of being held in a module
 * level variable: a module singleton leaks state between concurrent dev
 * servers and between test cases.
 */
export function resolveCompiler(root: string): SfcCompiler {
  const compiler =
    tryRequire<SfcCompiler>("vue/compiler-sfc", root) ??
    tryRequire<SfcCompiler>("vue/compiler-sfc");

  if (!compiler) {
    throw new Error(
      `[vite-plugin-vux] Failed to resolve vue/compiler-sfc from "${root}".\n` +
        `vite-plugin-vux requires vue (>=2.7.0) to be present in the dependency tree.`
    );
  }

  return compiler;
}

export function getType(block: Block): string {
  return block.type;
}

export function getFileName(block: Block): string {
  return block.filename;
}

export function getAttrs(block: Block): Record<string, string | true> {
  return block.attrs;
}

export function getContent(block: Block): string {
  return block.content;
}

function escapeAttrValue(value: string | true): string {
  return value === true ? "" : String(value).replace(/"/g, "&quot;");
}

function attrsToString(attrs: Record<string, string | true>): string {
  return Object.entries(attrs)
    .map(([key, value]) =>
      // Vue 2.7 normalises bare attributes to `true`, so emitting `scoped`
      // instead of `scoped="true"` round-trips correctly.
      value === true ? ` ${key}` : ` ${key}="${escapeAttrValue(value)}"`
    )
    .join("");
}

/** A block that survived the pipeline, or `""` when a plugin dropped it. */
type TransformedBlock = Block | "";

function transformBlockWithPlugins(
  block: Block,
  plugins: TransFormPlugin[] = []
): TransformedBlock {
  return plugins.reduce<TransformedBlock>((acc, plugin) => {
    if (!plugin || typeof plugin.fn !== "function") {
      return acc;
    }

    const result = plugin.fn(acc as Block);
    if (!result) {
      return acc;
    }
    if (result.destroyed) {
      return "";
    }

    return result;
  }, block);
}

function blockToCode(block: Block | ""): string {
  if (!block) return "";

  const attrs = attrsToString(getAttrs(block));
  return `<${getType(block)}${attrs}>${getContent(block)}</${getType(block)}>`;
}

export interface CompiledVue {
  template?: Block;
  script?: Block;
  styles: Block[];
  customBlocks: Block[];
}

export function compileVue(
  compiler: SfcCompiler,
  filename: string,
  source: string,
  sourceMap = true
): CompiledVue {
  const descriptor = compiler.parse({ filename, source, sourceMap });

  const template = descriptor.template
    ? ({ ...descriptor.template, filename } as Block)
    : undefined;

  const script = descriptor.script
    ? ({ ...descriptor.script, filename } as Block)
    : undefined;

  const styles = (descriptor.styles ?? [])
    .filter((style): style is SFCBlock => style !== null && style !== undefined)
    .map((style) => ({ ...style, filename }) as Block);

  const customBlocks = (descriptor.customBlocks ?? [])
    .filter((block): block is SFCBlock => block !== null && block !== undefined)
    .map((block) => ({ ...block, filename }) as Block);

  return { template, script, styles, customBlocks };
}

export function transformTemplate(
  template: Block | undefined,
  plugins: TransFormPlugin[] = []
): string {
  if (!template) return "";
  return blockToCode(transformBlockWithPlugins(template, plugins));
}

export function transformScript(
  script: Block | undefined,
  plugins: TransFormPlugin[] = []
): string {
  if (!script) return "";
  return blockToCode(transformBlockWithPlugins(script, plugins));
}

export function transformStyles(
  styles: Block[],
  plugins: TransFormPlugin[] = []
): string[] {
  return styles.reduce<string[]>((acc, styleBlock) => {
    const newStyleBlock = transformBlockWithPlugins(styleBlock, plugins);
    if (newStyleBlock) {
      acc.push(blockToCode(newStyleBlock));
    }
    return acc;
  }, []);
}

export function transformCustomBlocks(
  customBlocks: Block[],
  plugins: TransFormPlugin[] = []
): string[] {
  return customBlocks.reduce<string[]>((acc, customBlock) => {
    const newCustomBlock = transformBlockWithPlugins(customBlock, plugins);
    if (!newCustomBlock) return acc;

    acc.push(blockToCode(newCustomBlock));
    return acc;
  }, []);
}

export function generateVue(
  template: string,
  script: string,
  styles: string[],
  customBlocks: string[]
): string {
  return [template, script, ...styles, ...customBlocks].join("");
}
