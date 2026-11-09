import { describe, expect, it } from "vitest";

import { getComponentName, normalizePath, scopeOf } from "../src/vux/paths";

describe("normalizePath", () => {
  it("turns windows separators into posix ones", () => {
    expect(normalizePath("C:\\app\\src\\App.vue")).toBe("C:/app/src/App.vue");
  });

  it("leaves an already-normal path alone", () => {
    expect(normalizePath("/app/src/App.vue")).toBe("/app/src/App.vue");
  });
});

describe("getComponentName", () => {
  it("derives the component name from a posix path", () => {
    expect(
      getComponentName("/app/node_modules/vux/src/components/actionsheet/index.vue")
    ).toBe("actionsheet");
  });

  it("derives the component name from a windows path", () => {
    expect(
      getComponentName("C:\\app\\node_modules\\vux\\src\\components\\x-input\\index.vue")
    ).toBe("x-input");
  });

  it("is not fooled by user components folders that contain the word components", () => {
    expect(
      getComponentName("/app/src/components/actionsheet/Button.vue")
    ).toBeUndefined();
  });

  it("returns undefined for user project files", () => {
    expect(getComponentName("/app/src/App.vue")).toBeUndefined();
  });
});

describe("scopeOf", () => {
  it("reports a file inside a vux component", () => {
    expect(scopeOf("/app/node_modules/vux/src/components/x-input/index.vue")).toEqual({
      inNodeModules: true,
      inVuxPackage: true,
      component: "x-input",
    });
  });

  it("reports the same scope for the windows spelling of that path", () => {
    expect(
      scopeOf("C:\\app\\node_modules\\vux\\src\\components\\x-input\\index.vue")
    ).toEqual(scopeOf("/app/node_modules/vux/src/components/x-input/index.vue"));
  });

  it("tells another dependency apart from vux", () => {
    expect(scopeOf("/app/node_modules/lodash/index.js")).toEqual({
      inNodeModules: true,
      inVuxPackage: false,
      component: undefined,
    });
  });

  it("tells a path that merely contains the word node_modules apart from a real one", () => {
    // `my_node_modules` is an ordinary directory name; a loose `includes` test
    // here is what used to make the transforms disagree about who owns a file.
    expect(scopeOf("/app/my_node_modules/vux/index.vue")).toMatchObject({
      inNodeModules: false,
      inVuxPackage: false,
    });
  });

  it("reports an app's own file as belonging to nobody", () => {
    expect(scopeOf("/app/src/pages/Home.vue")).toEqual({
      inNodeModules: false,
      inVuxPackage: false,
      component: undefined,
    });
  });
});
