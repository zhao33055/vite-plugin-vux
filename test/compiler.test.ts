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
  type TransFormPlugin,
} from "../src/compiler";

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
  const upper = (name: string): TransFormPlugin => ({
    name,
    fn: (block) => {
      block.content = block.content.toUpperCase();
      return block;
    },
  });

  it("applies plugins in order", () => {
    const { template } = vue("<template><div>abc</div></template>");
    const out = transformTemplate(template, [upper("a"), upper("b")]);

    expect(out).toBe("<template><DIV>ABC</DIV></template>");
  });

  it("keeps the block when a plugin returns nothing", () => {
    const { template } = vue("<template><div>x</div></template>");
    const out = transformTemplate(template, [
      { name: "noop", fn: () => undefined },
      upper("a"),
    ]);

    expect(out).toBe("<template><DIV>X</DIV></template>");
  });

  it("drops a block flagged as destroyed", () => {
    const { customBlocks } = vue("<template><p/></template>\n<i18n>text</i18n>");
    const destroyer: TransFormPlugin = {
      name: "destroy",
      fn: (block: Block) => {
        block.destroyed = true;
        return block;
      },
    };

    expect(transformCustomBlocks(customBlocks, [destroyer])).toEqual([]);
    expect(transformCustomBlocks(customBlocks, [])).toEqual(["<i18n>text</i18n>"]);
  });

  it("emits bare attributes for valueless flags so scoped round-trips", () => {
    const { styles } = vue(
      '<template><p/></template>\n<style scoped lang="less">.a{}</style>'
    );
    const out = transformStyles(styles, [])[0] ?? "";

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

    expect(transformStyles([block], [])[0]).toBe('<style data-x="a&quot;b">.a{}</style>');
  });

  it("does not leave a stray space before an attribute-less block tag", () => {
    const { script } = vue(
      "<template><p/></template>\n<script>export default {}</script>"
    );

    expect(transformScript(script)).toBe("<script>export default {}</script>");
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
