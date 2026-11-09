import { describe, expect, it } from "vitest";

import { createTagRegex, removeTag, reserveTag } from "../src/dom";
import {
  inNodeModules,
  inVux,
  isCompiledSfc,
  isJavaScriptFile,
  isScriptLike,
  parseRequest,
} from "../src/utils/query";

describe("parseRequest", () => {
  it("splits filename and query", () => {
    const { filename, query } = parseRequest("/a/App.vue?vue&type=script&lang.js");

    expect(filename).toBe("/a/App.vue");
    expect(query.vue).toBe(true);
    expect(query.type).toBe("script");
    // Vue emits `&lang.js` as a valueless flag, not `&lang=js`.
    expect(query["lang.js"]).toBe("");
  });

  it("handles an id with no query", () => {
    const { filename, query } = parseRequest("/a/main.js");

    expect(filename).toBe("/a/main.js");
    expect(query.vue).toBeUndefined();
  });

  it("coerces index to a number", () => {
    expect(parseRequest("/a/App.vue?vue&type=style&index=2").query.index).toBe(2);
  });
});

describe("file predicates", () => {
  it("recognises real scripts", () => {
    for (const id of ["/a/main.js", "/a/app.ts", "/a/x.jsx", "/a/y.mjs"]) {
      expect(isJavaScriptFile(id)).toBe(true);
    }
  });

  it("rejects styles and assets", () => {
    for (const id of ["/a/style.css", "/a/theme.less", "/a/logo.png", "/a/index.html"]) {
      expect(isJavaScriptFile(id)).toBe(false);
    }
  });

  it("treats vue sub-requests as scripts but a raw SFC as not", () => {
    expect(isScriptLike("/a/App.vue?vue&type=script&lang.js")).toBe(true);
    expect(isScriptLike("/a/App.vue")).toBe(false);
  });
});

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

describe("inNodeModules", () => {
  it("matches posix and windows separators", () => {
    expect(inNodeModules("/app/node_modules/vux/src/a.js")).toBe(true);
    expect(inNodeModules("C:\\app\\node_modules\\vux\\src\\a.js")).toBe(true);
  });

  it("does not match a project directory that merely contains the word", () => {
    expect(inNodeModules("/app/src/node_modules_helper.js")).toBe(false);
  });
});

describe("inVux", () => {
  it("matches the vux package only", () => {
    expect(inVux("/app/node_modules/vux/src/a.js")).toBe(true);
    expect(inVux("C:\\app\\node_modules\\vux\\src\\a.js")).toBe(true);
    expect(inVux("/app/node_modules/vux-loader/src/a.js")).toBe(false);
    expect(inVux("/app/src/main.js")).toBe(false);
  });
});

describe("ssr tag helpers", () => {
  const template = `
    <div>
      <v-no-ssr><p>client only</p></v-no-ssr>
      <v-ssr><p>server only</p></v-ssr>
      <span>always</span>
    </div>`;

  it("escapes the tag name when building the matcher", () => {
    // Without escaping, `v-ssr` also matched inside `<v-ssr-wrapper>`.
    expect(reserveTag("<v-ssr-wrapper>keep</v-ssr-wrapper>", "v-ssr")).toBe(
      "<v-ssr-wrapper>keep</v-ssr-wrapper>"
    );
  });

  it("removes a tag and its content", () => {
    const out = removeTag(template, "v-no-ssr");

    expect(out).not.toContain("client only");
    expect(out).toContain("server only");
    expect(out).toContain("always");
  });

  it("keeps a tag's content and drops the tag", () => {
    const out = reserveTag(template, "v-ssr");

    expect(out).toContain("server only");
    expect(out).not.toContain("<v-ssr>");
  });

  it("produces a correctly anchored regex", () => {
    expect(createTagRegex("v-ssr").source).toContain("<v-ssr\\b");
  });
});
