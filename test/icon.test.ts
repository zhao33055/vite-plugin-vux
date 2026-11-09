import { describe, expect, it } from "vitest";

import { createXiconTransform, inlineXIcon, parseAttributes } from "../src/icon";
import { NO_SCOPE, type BlockView } from "../src/contracts";
import type { Config } from "../src/types";

const fakeSvg = (type: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><path d="M${type}" /></svg>`;

const load = (type: string) => fakeSvg(type);

describe("parseAttributes", () => {
  it("parses quoted values", () => {
    expect(parseAttributes('type="ios-arrow-up" size="30"')).toEqual({
      type: "ios-arrow-up",
      size: "30",
    });
  });

  it("returns an empty object when there are no attributes", () => {
    // The previous implementation called .map on a null match and threw here.
    expect(parseAttributes("")).toEqual({});
  });

  it("strips the .native listener modifier", () => {
    expect(parseAttributes('v-on:click.native="go"')["v-on:click"]).toBe("go");
  });
});

describe("inlineXIcon", () => {
  it("inlines a paired tag with a static type", () => {
    const out = inlineXIcon('<x-icon type="close"></x-icon>', load);

    expect(out).toContain("vux-x-icon-close");
    expect(out).toContain('width="24"');
    expect(out).toContain('height="24"');
    // The class legitimately contains `vux-x-icon`; the *tag* must be gone.
    expect(out).not.toContain("<x-icon");
  });

  it("inlines a self closing tag", () => {
    const out = inlineXIcon('<x-icon type="close"/>', load);

    expect(out).toContain("vux-x-icon-close");
  });

  it("honours the size attribute", () => {
    expect(inlineXIcon('<x-icon type="close" size="30"></x-icon>', load)).toContain(
      'width="30"'
    );
  });

  it("does not leak the selecting attributes onto the svg", () => {
    const out = inlineXIcon('<x-icon type="close" size="30" role="img"></x-icon>', load);

    // `type` and `size` pick the icon; only unrelated attributes are forwarded.
    expect(out).not.toContain('type="close"');
    expect(out).not.toContain('size="30"');
    expect(out).toContain('role="img"');
  });

  it("merges an existing class instead of dropping it", () => {
    const out = inlineXIcon('<x-icon type="close" class="icon-red"></x-icon>', load);

    expect(out).toContain('class="vux-x-icon vux-x-icon-close icon-red"');
  });

  it("handles a tag with no attributes at all", () => {
    // No type means there is nothing to resolve; the tag must survive intact.
    expect(inlineXIcon("<x-icon></x-icon>", load)).toBe("<x-icon></x-icon>");
  });

  it("leaves bound types alone for the runtime component", () => {
    const source = '<x-icon :type="currentIcon"></x-icon>';

    expect(inlineXIcon(source, load)).toBe(source);
    expect(inlineXIcon('<x-icon v-bind:type="currentIcon"></x-icon>', load)).toContain(
      "v-bind:type"
    );
  });

  it("leaves the tag untouched when the icon file is missing", () => {
    const source = '<x-icon type="does-not-exist"></x-icon>';

    expect(inlineXIcon(source, () => null)).toBe(source);
  });

  it("inlines several icons in one template", () => {
    const out = inlineXIcon(
      '<div><x-icon type="a"></x-icon><x-icon type="b"/></div>',
      load
    );

    expect(out).toContain("vux-x-icon-a");
    expect(out).toContain("vux-x-icon-b");
  });

  it("does not touch other elements", () => {
    const source = "<div><span>x</span></div>";

    expect(inlineXIcon(source, load)).toBe(source);
  });
});

describe("x-icon transform", () => {
  /** Reads the real `vux/src/icons` of the installed package. */
  const config: Config = {
    root: process.cwd(),
    ssr: false,
    componentMap: {},
    plugins: [],
  };

  function run(content: string, filename = "/app/src/pages/Home.vue") {
    const block: BlockView = { type: "template", filename, content, attrs: {} };
    // Scope deliberately says "the app's own file": icons are inlined everywhere.
    return createXiconTransform(config)(block, NO_SCOPE);
  }

  it("reports the inlined markup as a patch", () => {
    const patch = run('<div><x-icon type="ios-arrow-up"></x-icon></div>');

    expect(patch?.content).toContain("vux-x-icon-ios-arrow-up");
    expect(patch?.content).not.toContain("<x-icon");
  });

  it("says nothing when the template has no icons", () => {
    // The pipeline uses "no patch" to skip re-serialising a block.
    expect(run("<div>plain markup</div>")).toBeUndefined();
  });

  it("keeps a bound type as a component call", () => {
    const patch = run('<x-icon :type="current"></x-icon>');

    expect(patch).toBeUndefined();
  });
});
