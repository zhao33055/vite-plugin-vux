import { describe, expect, it } from "vitest";

import {
  patchBareComponentImports,
  patchCommonJs,
  patchVuxSource,
} from "../src/transforms/vux-patches";

// Only consumer left: the esbuild pre-bundle hook, where rewriting the
// specifier is the only trick available. See the resolver plugin for Vite proper.
describe("patchBareComponentImports", () => {
  const cases: Array<[string, string]> = [
    ["vux/src/plugins/loading/index.js", "../../components/loading"],
    ["vux/src/plugins/confirm/index.js", "../../components/confirm"],
    ["vux/src/plugins/alert/util.js", "../../components/alert"],
    ["vux/src/plugins/toast/index.js", "../../components/toast"],
  ];

  it.each(cases)("appends /index.vue inside %s", (id, specifier) => {
    const code = `import C from '${specifier}'\nexport default C`;
    const patched = patchBareComponentImports(id, code);

    expect(patched).toBe(`import C from '${specifier}/index.vue'\nexport default C`);
  });

  it("supports windows style paths", () => {
    const code = `import C from '../../components/loading'`;
    const patched = patchBareComponentImports(
      "project/node_modules\\vux/src/plugins/loading/index.js",
      code
    );

    expect(patched).toContain("../../components/loading/index.vue");
  });

  it("returns null when nothing needs patching", () => {
    expect(
      patchBareComponentImports(
        "vux/src/components/x-button/index.vue",
        "export default {}"
      )
    ).toBe(null);
  });

  it("is idempotent - a second pass reports no change at all", () => {
    const code = `import C from '../../components/loading'`;
    const once = patchBareComponentImports("vux/src/plugins/loading/index.js", code);
    const twice = patchBareComponentImports(
      "vux/src/plugins/loading/index.js",
      once ?? code
    );

    expect(once).toContain("../../components/loading/index.vue");
    // `null`, not the already-patched text: the transform hook can tell Vite it
    // changed nothing.
    expect(twice).toBe(null);
  });
});

describe("patchCommonJs", () => {
  // Shape of vux 2.9.x, which authored these files as CommonJS.
  const scroller = [
    `const Animate = require('./animate')`,
    `const { getElement, getComputedStyle } = require('./util')`,
    `export default { created() { Animate.run(); getElement('#a') } }`,
  ].join("\n");

  it("converts require calls into imports", () => {
    const result = patchCommonJs("vux/src/components/picker/scroller.js", scroller);

    expect(result).not.toBeNull();
    expect(result?.code).toContain(`import Animate from './animate'`);
    expect(result?.code).toMatch(/import\s*\{[^}]*getElement[^}]*\}\s*from\s*'\.\/util'/);
    expect(result?.code).not.toContain("require(");
  });

  it("leaves pure CommonJS files to Vite", () => {
    // range/lib/delegate.js is pure CommonJS. Converting it here produced a
    // second set of `var bind`/`var unbind` declarations on top of the ones
    // Vite's own CommonJS pass emits - a duplicate-declaration build error.
    const delegate = [
      `var closest = require('./closest')`,
      `var event = require('./event')`,
      `exports.bind = function (el, selector, type, fn, capture) { return event.bind(el, type, fn, capture) }`,
      `exports.unbind = function (el, type, fn, capture) { event.unbind(el, type, fn, capture) }`,
    ].join("\n");

    expect(patchCommonJs("vux/src/components/range/lib/delegate.js", delegate)).toBe(
      null
    );
    expect(
      patchCommonJs(
        "vux/src/components/range/lib/classes.js",
        `var utils = require('../utils')\nexports.has = function () { return utils.indexof }\nmodule.exports = {}`
      )
    ).toBe(null);
  });

  it("leaves already-clean ESM files alone", () => {
    expect(
      patchCommonJs("vux/src/libs/passive_supported.js", `export default false`)
    ).toBe(null);
    expect(
      patchCommonJs("vux/src/components/range/powerange.js", `import a from 'b'`)
    ).toBe(null);
  });

  it("ignores files outside the vux package", () => {
    expect(patchCommonJs("my-app/src/main.js", `const a = require('b')`)).toBe(null);
  });
});

describe("patchVuxSource", () => {
  it("skips user project files entirely", () => {
    expect(
      patchVuxSource(
        "/project/src/App.vue",
        `const a = require('b')`,
        "/project/src/App.vue"
      )
    ).toBe(null);
  });

  it("leaves specifier rewriting to the resolver plugin", () => {
    // Editing a module's text to fix a path was the old approach; the resolver
    // now answers `../../components/toast` -> `.../index.vue` without touching
    // the source, so this hook must report "no change" rather than rewrite.
    expect(
      patchVuxSource(
        "project/node_modules/vux/src/plugins/toast/index.js",
        `import C from '../../components/toast'`,
        "toast.js"
      )
    ).toBe(null);
  });

  it("warns when a require is left behind inside a function body", () => {
    const warnings: string[] = [];
    const code = [
      `const Animate = require('./animate')`,
      `export default { mounted() { const mod = require('./mod'); mod.run(Animate) } }`,
    ].join("\n");

    const result = patchVuxSource(
      "project/node_modules/vux/src/components/picker/scroller.js",
      code,
      "scroller.js",
      (message) => warnings.push(message)
    );

    expect(result?.code).toContain(`import Animate from './animate'`);
    // A require nested in a function cannot become an import; saying so at
    // build time beats a ReferenceError in the browser.
    expect(warnings.join("\n")).toMatch(/1 remain/i);
  });
});
