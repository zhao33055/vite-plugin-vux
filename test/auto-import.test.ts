import { describe, expect, it } from "vitest";

import { transformVuxImport } from "../src/transforms/auto-import";

// A slice of vux's real map.json, enough to cover every code path.
const map: Record<string, string> = {
  Button: "src/components/x-button/index.vue",
  Input: "src/components/x-input/index.vue",
  Scroller: "src/components/scroller/index.vue",
};

function run(code: string) {
  const unknown: string[] = [];
  const result = transformVuxImport(code, map, {
    filename: "/project/src/main.js",
    onUnknown: (name) => unknown.push(name),
  });

  // Babel reprints string literals with double quotes; normalise them so the
  // assertions below can be written with single quotes.
  const code2 = (result?.code ?? code).split(DQ).join(SQ);

  return { code: code2, unknown, changed: result !== null };
}

const DQ = String.fromCharCode(34);
const SQ = "'";

describe("transformVuxImport", () => {
  it("splits a grouped import into one default import per component", () => {
    const { code } = run(
      ["import { Button, Input } from 'vux'", "console.log(Button, Input)"].join("\n")
    );

    expect(code).toContain("import Button from 'vux/src/components/x-button/index.vue'");
    expect(code).toContain("import Input from 'vux/src/components/x-input/index.vue'");
    expect(code).not.toContain("from 'vux'");
  });

  it("honours rename specifiers", () => {
    const { code } = run("import { Button as MyButton } from 'vux'");

    expect(code).toContain(
      "import MyButton from 'vux/src/components/x-button/index.vue'"
    );
  });

  it("handles multi-line imports", () => {
    const { code } = run(
      [
        "import {",
        "  Button,",
        "  Input",
        "} from 'vux'",
        "export default { components: { Button, Input } }",
      ].join("\n")
    );

    expect(code).toContain("vux/src/components/x-button/index.vue");
    expect(code).toContain("vux/src/components/x-input/index.vue");
  });

  it("leaves unknown names on the original module instead of emitting vux/undefined", () => {
    const { code, unknown } = run("import { Button, NotAComponent } from 'vux'");

    expect(code).toContain("import { NotAComponent } from 'vux'");
    expect(code).not.toContain("vux/undefined");
    expect(unknown).toEqual(["NotAComponent"]);
  });

  it("keeps default and namespace imports untouched", () => {
    expect(run("import vux from 'vux'").changed).toBe(false);
    expect(run("import * as Vux from 'vux'").changed).toBe(false);
  });

  it("returns null for files without any vux import", () => {
    expect(run("import Vue from 'vue'; Vue.use({})").changed).toBe(false);
    expect(run("const a = 1").changed).toBe(false);
  });

  it("does not touch imports from other packages that merely mention vux", () => {
    const source = "import { Button } from 'vux-some-other-lib'";
    expect(run(source).changed).toBe(false);
  });

  it("preserves the rest of the module", () => {
    const { code } = run(
      [
        "import { Button } from 'vux'",
        "import Vue from 'vue'",
        "export default {",
        "  components: { Button },",
        "  mounted() { /* comment survives */ }",
        "}",
      ].join("\n")
    );

    expect(code).toContain("import Vue from 'vue'");
    expect(code).toContain("components: { Button }");
    expect(code).toContain("comment survives");
  });

  it("produces a sourcemap with real mappings so later plugins can chain it", () => {
    // A file with content beyond the import: babel cannot emit mappings for
    // nodes it generated itself, so a one-line input yields an empty map.
    const source = [
      "import { Button } from 'vux'",
      "import Vue from 'vue'",
      "export default {",
      "  components: { Button },",
      "  mounted() { console.log('hi') }",
      "}",
    ].join("\n");

    const result = transformVuxImport(source, map, {
      filename: "/project/src/App.vue",
    });

    expect(result?.map?.version).toBe(3);
    expect((result?.map?.mappings ?? "").length).toBeGreaterThan(0);
  });
});
