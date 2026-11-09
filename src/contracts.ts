import type { SFCBlock } from "vue/compiler-sfc";

/**
 * The vocabulary shared by the block pipeline and its transforms.
 *
 * Kept free of implementation imports so that anything can depend on it without
 * dragging in the filesystem, Vue or Vite.
 */

export type BlockAttrs = SFCBlock["attrs"];

/**
 * Where a module sits, decided once per file.
 *
 * Every transform used to answer this for itself - `includes("node_modules")`
 * here, a `vux/src/components` regex there, `inVux` somewhere else - and the
 * predicates disagreed. Divergent ownership tests are how a transform ends up
 * rewriting an app's file, or skipping the vux file it was written for.
 */
export interface FileScope {
  readonly inNodeModules: boolean;
  readonly inVuxPackage: boolean;
  /** Component directory name when the file belongs to a vux component. */
  readonly component?: string;
}

/**
 * Scope for a file that belongs to nobody: an app's own sources, and the unit
 * tests that exercise one transform in isolation.
 */
export const NO_SCOPE: FileScope = { inNodeModules: false, inVuxPackage: false };

/** What a transform is allowed to look at. */
export interface BlockView {
  readonly type: string;
  readonly filename: string;
  readonly content: string;
  readonly attrs: Readonly<BlockAttrs>;
}

/** What a transform is allowed to change. */
export interface BlockPatch {
  readonly content?: string;
  /** Full replacement attribute map; omit to leave the attributes alone. */
  readonly attrs?: BlockAttrs;
  /** Remove the block from the emitted SFC entirely. */
  readonly drop?: boolean;
}

/**
 * A block-level transform: reads a block, reports what changed.
 *
 * Returning a patch instead of mutating is what makes these directly testable -
 * no descriptor, no pipeline, just an object in and an object out - and lets the
 * pipeline tell "nothing to do" apart from "I rewrote this".
 */
export type BlockTransform = (
  block: BlockView,
  scope: FileScope
) => BlockPatch | undefined | void;
