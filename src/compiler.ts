import type { SFCBlock, SFCDescriptor } from "vue/compiler-sfc";

import { tryRequire } from "./utils/module";
import type { BlockTransform, BlockView, FileScope } from "./contracts";

/**
 * A single SFC block, tagged with the file it came from.
 *
 * This is the pipeline's own mutable copy: `vue/compiler-sfc` hands back one
 * descriptor per parse and the blocks are re-serialised afterwards. Transforms
 * never see it - they get a read-only `BlockView` (see `./contracts`).
 */
export interface Block extends Omit<SFCBlock, "start" | "end"> {
  filename: string;
  /**
   * Source offsets. The parser always fills these in, but a block only needs
   * `type`, `content` and `attrs` to be re-serialised, so they stay optional.
   */
  start?: number;
  end?: number;
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

/** A block that survived the pipeline, or `""` when a transform dropped it. */
type TransformedBlock = Block | "";

/**
 * Runs the transforms over one block.
 *
 * This is the only place in the pipeline that holds mutable state: transforms
 * report patches, and the accumulated `content`/`attrs` are threaded through to
 * the next transform, so an icon replacement is visible to the i18n pass that
 * follows it.
 */
function applyTransforms(
  block: Block,
  transforms: readonly BlockTransform[],
  scope: FileScope
): TransformedBlock {
  let { content, attrs } = block;

  for (const transform of transforms) {
    const view: BlockView = {
      type: block.type,
      filename: block.filename,
      content,
      attrs,
    };

    const patch = transform(view, scope);
    if (!patch) continue;
    if (patch.drop) return "";

    if (patch.content !== undefined) content = patch.content;
    if (patch.attrs !== undefined) attrs = patch.attrs;
  }

  if (content === block.content && attrs === block.attrs) return block;
  return { ...block, content, attrs };
}

function blockToCode(block: Block | ""): string {
  if (!block) return "";

  return `<${block.type}${attrsToString(block.attrs)}>${block.content}</${block.type}>`;
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

/**
 * The four entry points below re-emit one part of the SFC each.
 *
 * `scope` is passed in rather than derived here so that this module keeps no
 * opinion about which package a file came from - that is `vux/paths`' job, and
 * the caller resolves it once per file for all four kinds of block.
 */
export function transformTemplate(
  template: Block | undefined,
  transforms: readonly BlockTransform[],
  scope: FileScope
): string {
  if (!template) return "";
  return blockToCode(applyTransforms(template, transforms, scope));
}

export function transformScript(
  script: Block | undefined,
  transforms: readonly BlockTransform[],
  scope: FileScope
): string {
  if (!script) return "";
  return blockToCode(applyTransforms(script, transforms, scope));
}

export function transformStyles(
  styles: Block[],
  transforms: readonly BlockTransform[],
  scope: FileScope
): string[] {
  return styles.reduce<string[]>((acc, styleBlock) => {
    const transformed = applyTransforms(styleBlock, transforms, scope);
    if (transformed) acc.push(blockToCode(transformed));
    return acc;
  }, []);
}

export function transformCustomBlocks(
  customBlocks: Block[],
  transforms: readonly BlockTransform[],
  scope: FileScope
): string[] {
  return customBlocks.reduce<string[]>((acc, customBlock) => {
    const transformed = applyTransforms(customBlock, transforms, scope);
    if (transformed) acc.push(blockToCode(transformed));
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
