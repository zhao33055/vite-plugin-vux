import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createRecorder } from "./helpers/recorder";

import {
  getComponentMap,
  getStylesDir,
  getThemeVariables,
  getVariables,
} from "../src/vux/api";

/**
 * Everything here reads the `vux-mini` fixture rather than the installed
 * package, so an assertion failing means this plugin changed, not vux.
 */
const root = path.resolve(__dirname, "fixtures/vux-mini");

/** A project root with no vux in it at all. */
const noVuxRoot = path.resolve(__dirname, "fixtures/no-vux");

describe("getComponentMap", () => {
  it("reads the component table from the package's own layout", () => {
    expect(getComponentMap(root)).toEqual({
      Actionsheet: "src/components/actionsheet/index.vue",
      Datetime: "src/components/datetime/index.vue",
      InlineDesc: "src/components/inline-desc/index.vue",
      XButton: "src/components/x-button/index.vue",
      XInput: "src/components/x-input/index.vue",
      XSwitch: "src/components/x-switch/index.vue",
    });
  });

  it("throws a helpful error when vux is not installed", () => {
    expect(() => getComponentMap(noVuxRoot)).toThrowError(
      /Cannot find vux component map/
    );
  });
});

describe("getStylesDir", () => {
  it("returns a directory, which is what less `paths` expects", () => {
    const dir = getStylesDir(root);

    expect(path.basename(dir)).toBe("styles");
    expect(fs.statSync(dir).isDirectory()).toBe(true);
  });
});

describe("getVariables", () => {
  it("parses declarations, ignores comments and follows @import", () => {
    const vars = getVariables(path.resolve(root, "theme.less"));

    expect(vars).toMatchObject({
      color: "#2d8cf0",
      gap: "10px",
      "weui-cell__bd__font-size": "14px",
      // from theme-partial.less via @import
      "imported-variable": "blue",
    });
    expect(vars.color).toBe("#2d8cf0");
  });

  it("warns and skips names that cannot be less variables", () => {
    const logger = createRecorder();
    // The fixture contains a selector line, which must not become a variable.
    const vars = getVariables(path.resolve(root, "theme.less"), logger);

    expect(Object.keys(vars).every((key) => /^[A-Za-z0-9_-]+$/.test(key))).toBe(true);
    expect(logger.messages).toEqual([
      "ignoring suspicious theme variable name: bad name with spaces",
    ]);
  });

  it("throws when the theme file is missing", () => {
    expect(() => getVariables(path.resolve(root, "nope.less"))).toThrowError(
      /theme file not found/
    );
  });
});

describe("getThemeVariables", () => {
  it("returns an empty object without a less-theme plugin", () => {
    expect(getThemeVariables(root, [])).toEqual({});
  });

  it("reads the file named by the less-theme plugin, relative to the root", () => {
    expect(
      getThemeVariables(root, [{ name: "less-theme", path: "theme.less" }])
    ).toMatchObject({ color: "#2d8cf0" });
  });
});
