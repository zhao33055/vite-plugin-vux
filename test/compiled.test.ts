import { describe, expect, it } from "vitest";

import { isCompiledSfc } from "../src/sfc/compiled";

describe("isCompiledSfc", () => {
  it("recognises plugin-vue2 output, which keeps the plain .vue id", () => {
    expect(
      isCompiledSfc("/a/App.vue", 'import { render } from "./render";\nexport default {}')
    ).toBe(true);
  });

  it("does not mistake the raw SFC for JavaScript", () => {
    expect(isCompiledSfc("/a/App.vue", "<template><p/></template>")).toBe(false);
    expect(isCompiledSfc("/a/App.vue", "\n  <template><p/></template>")).toBe(false);
  });

  it("ignores non-vue ids", () => {
    expect(isCompiledSfc("/a/main.js", "import x from 'y'")).toBe(false);
  });
});
