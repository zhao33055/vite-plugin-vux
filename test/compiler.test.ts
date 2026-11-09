import { describe, expect, it } from "vitest";

import {
  compileVue,
  generateVue,
  transformCustomBlocks,
  transformScript,
  transformStyles,
  transformTemplate,
  resolveCompiler,
  type Block,
} from "../src/sfc/compiler";
import { NO_SCOPE, type BlockTransform } from "../src/contracts";

const compiler = resolveCompiler(process.cwd());

function vue(source: string, filename = "/project/src/App.vue") {
  return compileVue(compiler, filename, source);
}

describe("compileVue", () => {
  it("splits an SFC into blocks tagged with their file", () => {
    const { template, script, styles, customBlocks } = vue(
      `<template><div>hi</div></template>
<script>export default { name: "App" }</script>
<style lang="less">.a { color: red }</style>
<i18n>en: { a: 1 }</i18n>`
    );

    expect(template?.content).toContain("<div>hi</div>");
    expect(template?.filename).toBe("/project/src/App.vue");
    expect(script?.content).toContain('name: "App"');
    expect(styles).toHaveLength(1);
    expect(styles[0]?.attrs.lang).toBe("less");
    expect(customBlocks).toHaveLength(1);
    expect(customBlocks[0]?.type).toBe("i18n");
  });

  it("tolerates files that are missing blocks entirely", () => {
    const { template, script, styles, customBlocks } = vue("<template><p/></template>");

    expect(template).toBeDefined();
    expect(script).toBeUndefined();
    expect(styles).toEqual([]);
    expect(customBlocks).toEqual([]);
  });

  it("does not mutate the descriptor across calls", () => {
    const source = "<template><p/></template>";
    const first = vue(source, "/a/App.vue");
    const second = vue(source, "/b/App.vue");

    expect(first.template?.filename).toBe("/a/App.vue");
    expect(second.template?.filename).toBe("/b/App.vue");
  });
});

describe("block transforms", () => {
  const scope = { ...NO_SCOPE, component: "alert" };

  const upper = (): BlockTransform => (block) => ({
    content: block.content.toUpperCase(),
  });

  it("applies transforms in order, seeing each other's output", () => {
    const { template } = vue("<template><div>abc</div></template>");
    const seen: string[] = [];
    const mark =
      (letter: string): BlockTransform =>
      (block) => ({
        content: `${block.content}${letter}`,
      });
    const record: BlockTransform = (block) => {
      seen.push(block.content);
    };

    const out = transformTemplate(template, [mark("a"), record, mark("b")], scope);

    expect(out).toBe("<template><div>abc</div>ab</template>");
    // The middle transform saw the first one's output, not the source.
    expect(seen).toEqual(["<div>abc</div>a"]);
  });

  it("keeps the block when a transform returns nothing", () => {
    const { template } = vue("<template><div>x</div></template>");
    const out = transformTemplate(template, [() => undefined, upper()], scope);

    expect(out).toBe("<template><DIV>X</DIV></template>");
  });

  it("drops a block a transform asked to remove", () => {
    const { customBlocks } = vue("<template><p/></template>\n<i18n>text</i18n>");

    expect(transformCustomBlocks(customBlocks, [() => ({ drop: true })], scope)).toEqual(
      []
    );
    expect(transformCustomBlocks(customBlocks, [], scope)).toEqual(["<i18n>text</i18n>"]);
  });

  it("reports an attribute patch as a new object, never an edit", () => {
    // The descriptor's `attrs` is shared with the block copy made in
    // `compileVue`; a transform that deleted a key in place would corrupt the
    // descriptor a second parse would otherwise still be able to read.
    const { template } = vue('<template lang="pug"><p/></template>');
    const attrsBefore = { ...template?.attrs };

    const out = transformTemplate(
      template,
      [
        (block) => {
          const { lang: _lang, ...rest } = block.attrs;
          return { attrs: rest };
        },
      ],
      scope
    );

    expect(out).toBe("<template><p/></template>");
    expect(template?.attrs).toEqual(attrsBefore);
  });

  it("emits bare attributes for valueless flags so scoped round-trips", () => {
    const { styles } = vue(
      '<template><p/></template>\n<style scoped lang="less">.a{}</style>'
    );
    const out = transformStyles(styles, [], scope)[0] ?? "";

    expect(out).toContain(" scoped");
    expect(out).not.toContain("scoped=true");
    // The re-emitted SFC must still be seen as scoped by the Vue compiler.
    const reparsed = compileVue(
      compiler,
      "/project/src/App.vue",
      `<template><p/></template>\n${out}`
    );
    expect(reparsed.styles[0]?.scoped).toBe(true);
  });

  it("escapes quotes in attribute values", () => {
    // Built by hand: this exercises our serializer, not Vue's parser.
    const block: Block = {
      type: "style",
      content: ".a{}",
      attrs: { "data-x": 'a"b' },
      filename: "/project/src/App.vue",
    };

    expect(transformStyles([block], [], scope)[0]).toBe(
      '<style data-x="a&quot;b">.a{}</style>'
    );
  });

  it("does not leave a stray space before an attribute-less block tag", () => {
    const { script } = vue(
      "<template><p/></template>\n<script>export default {}</script>"
    );

    expect(transformScript(script, [], scope)).toBe("<script>export default {}</script>");
  });
});

describe("generateVue", () => {
  it("concatenates every block into a valid SFC", () => {
    const out = generateVue(
      "<template><p/></template>",
      "<script>a</script>",
      ["<style>b</style>"],
      ["<i18n>c</i18n>"]
    );

    expect(out).toBe(
      "<template><p/></template><script>a</script><style>b</style><i18n>c</i18n>"
    );
  });

  it("produces an empty string for an empty component", () => {
    expect(generateVue("", "", [], [])).toBe("");
  });
});
