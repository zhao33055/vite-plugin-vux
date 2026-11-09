import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  getComponentMap,
  getStylesDir,
  getThemeVariables,
  getVariables,
} from "../src/vux/api";

const root = process.cwd();

describe("getComponentMap", () => {
  it("loads the real vux component map", () => {
    const map = getComponentMap(root);

    expect(Object.keys(map).length).toBeGreaterThan(100);
    // map.json keys are vux's own PascalCase names (XButton, not Button).
    expect(map.XButton).toContain("components");
    expect(map.XButton).toMatch(/\.vue$/);
  });

  it("throws a helpful error when vux is not installed", () => {
    expect(() => getComponentMap(path.resolve(__dirname, "fixtures"))).toThrowError(
      /Cannot find vux component map/
    );
  });
});

describe("getStylesDir", () => {
  it("returns a directory, which is what less `paths` expects", () => {
    const dir = getStylesDir(root);

    expect(dir).toMatch(/styles$/);
    expect(path.basename(dir)).toBe("styles");
  });
});

describe("getVariables", () => {
  it("parses declarations, ignores comments and follows @import", () => {
    const vars = getVariables(path.resolve(__dirname, "fixtures/theme.less"));

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
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const filePath = path.resolve(__dirname, "fixtures/theme.less");
    // The fixture contains a selector line, which must not become a variable.
    const vars = getVariables(filePath);

    expect(Object.keys(vars).every((key) => /^[A-Za-z0-9_-]+$/.test(key))).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("throws when the theme file is missing", () => {
    expect(() =>
      getVariables(path.resolve(__dirname, "fixtures/nope.less"))
    ).toThrowError(/theme file not found/);
  });
});

describe("getThemeVariables", () => {
  it("returns an empty object without a less-theme plugin", () => {
    expect(getThemeVariables(root, [])).toEqual({});
  });

  it("reads the file named by the less-theme plugin", () => {
    expect(
      getThemeVariables(root, [{ name: "less-theme", path: "test/fixtures/theme.less" }])
    ).toMatchObject({ color: "#2d8cf0" });
  });
});
