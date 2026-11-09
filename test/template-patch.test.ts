import { describe, expect, it } from "vitest";

import { literalFor, patchTemplate, type TemplatePatch } from "../src/template-patch";

describe("literalFor", () => {
  it("uses a JSON literal outside an attribute", () => {
    expect(literalFor("确定", {})).toBe('"确定"');
  });

  it("switches to single quotes inside a double-quoted attribute", () => {
    expect(literalFor("确定", { quote: '"' })).toBe("'确定'");
  });

  it("switches to double quotes inside a single-quoted attribute", () => {
    expect(literalFor("确定", { quote: "'" })).toBe('"确定"');
  });

  it("escapes a value that contains the quote it has to use", () => {
    expect(literalFor("it's", { quote: '"' })).toBe("'it\\'s'");
    expect(literalFor('say "hi"', { quote: "'" })).toBe('"say \\"hi\\""');
  });

  it("escapes backslashes so the expression still parses", () => {
    expect(literalFor("a\\b", { quote: '"' })).toBe("'a\\\\b'");
  });
});

describe("patchTemplate", () => {
  const call: TemplatePatch = {
    pattern: /\$t\((\w+)\)/,
    replace: (_match, [key], context) => `L(${literalFor(key ?? "?", context)})`,
  };

  it("rewrites every match", () => {
    expect(patchTemplate("$t(a) $t(b)", [call])).toBe('L("a") L("b")');
  });

  it("leaves an occurrence alone when the replacement returns the match", () => {
    const decline: TemplatePatch = {
      pattern: /\$t\((\w+)\)/,
      replace: (match, [key]) => (key === "skip" ? match : "X"),
    };

    expect(patchTemplate("$t(skip) $t(go)", [decline])).toBe("$t(skip) X");
  });

  it("detects the attribute a match sits in", () => {
    const source = `<p :title="$t(a)">{{ $t(b) }}</p>`;

    // First call is inside an attribute, second is an interpolation.
    expect(patchTemplate(source, [call])).toBe(`<p :title="L('a')">{{ L("b") }}</p>`);
  });

  it("does not mistake text after a closed tag for attribute text", () => {
    // The `"` in the finished attribute must not put the interpolation inside an
    // unterminated attribute.
    const source = `<p x="1">{{ $t(a) }}</p>`;

    expect(patchTemplate(source, [call])).toBe(`<p x="1">{{ L("a") }}</p>`);
  });

  it("handles single-quoted attributes", () => {
    expect(patchTemplate(`<p :title='$t(a)' />`, [call])).toBe(`<p :title='L("a")' />`);
  });

  it("reads the context from the original text, not from the patched one", () => {
    const source = `<p a="$t(1)" b="$t(2)" />`;
    const withAngleBracket: TemplatePatch = {
      pattern: /\$t\((\d)\)/,
      // Translations containing `>` exist, and an inlined icon is nothing but
      // markup. Either one would end the tag as far as a scanner is concerned.
      replace: (_match, [n], context) => `>${n}${literalFor("x", context)}`,
    };

    // Both calls sit inside attributes, so both get single quotes. Were the
    // context read off the already-patched text, the `>` inserted before the
    // second call would look like the end of the tag and its literal would come
    // out double-quoted - closing the attribute and dropping the element.
    expect(patchTemplate(source, [withAngleBracket])).toBe(`<p a=">1'x'" b=">2'x'" />`);
  });

  it("is unaffected by a global pattern used by a previous file", () => {
    // A shared `/g` regex carries `lastIndex` between calls, which would make
    // the output depend on how many files were processed before this one.
    const shared: TemplatePatch = { pattern: /a/g, replace: () => "b" };

    expect(patchTemplate("aaa", [shared])).toBe("bbb");
    expect(patchTemplate("aaa", [shared])).toBe("bbb");
    expect(patchTemplate("aaa", [shared])).toBe("bbb");
  });

  it("applies patches in order", () => {
    const patches: TemplatePatch[] = [
      { pattern: /a/, replace: () => "b" },
      { pattern: /b/, replace: () => "c" },
    ];

    expect(patchTemplate("a", patches)).toBe("c");
  });

  it("returns the input unchanged when nothing matches", () => {
    // Callers compare the result against the input to decide whether a block
    // needs re-serialising, so an untouched template must come back identical.
    expect(patchTemplate("<p>plain</p>", [call])).toBe("<p>plain</p>");
  });
});
