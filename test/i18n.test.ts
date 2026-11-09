import path from "node:path";

import { describe, expect, it } from "vitest";

import { createRecorder } from "./helpers/recorder";

import {
  createI18nCustomBlockTransform,
  createI18nTransform,
  resolveStaticTranslations,
} from "../src/sfc/transforms/i18n";
import { compileVue, resolveCompiler } from "../src/sfc/compiler";
import type { BlockView } from "../src/contracts";
import { scopeOf } from "../src/vux/paths";
import type { Config, VuxLoaderPlugin } from "../src/types";

const locales: Record<string, Record<string, string>> = {
  "zh-CN": {
    "vux.actionsheet.cancel": "取消",
    "vux.alert.button_text": "确定",
  },
  en: {
    "vux.actionsheet.cancel": "cancel",
    "vux.alert.button_text": "OK",
  },
};

const lookup = (key: string) => locales["zh-CN"][key];

describe("resolveStaticTranslations", () => {
  it("replaces a single quoted literal", () => {
    const out = resolveStaticTranslations(`{{ $t('cancel') }}`, {
      prefix: "vux.actionsheet",
      lookup,
    });

    expect(out).toBe('{{ "取消" }}');
  });

  it("uses single quotes inside a double-quoted attribute", () => {
    // Emitting `"确定"` here produced `:data-confirm-text=""确定""`: the quote
    // closed the attribute early, and the template compiler dropped the element
    // as "text outside root element" (vux's datetime component, in dev mode).
    const source = `<x-alert\n  :data-button-text="$t('button_text')"\n  @ok="go" />`;

    expect(resolveStaticTranslations(source, { prefix: "vux.alert", lookup })).toBe(
      `<x-alert\n  :data-button-text="'确定'"\n  @ok="go" />`
    );
  });

  it("uses double quotes inside a single-quoted attribute", () => {
    const source = `<x-alert :data-button-text='$t("button_text")' />`;

    expect(resolveStaticTranslations(source, { prefix: "vux.alert", lookup })).toBe(
      `<x-alert :data-button-text='"确定"' />`
    );
  });

  it("escapes a translation that contains the attribute quote", () => {
    const out = resolveStaticTranslations(`<p :title="$t('quoted')">`, {
      prefix: "vux.alert",
      lookup: (key) => (key === "vux.alert.quoted" ? `it's 确定` : undefined),
    });

    expect(out).toBe(`<p :title="'it\\'s 确定'">`);
  });

  it("tolerates whitespace inside the call", () => {
    expect(
      resolveStaticTranslations(`$t(  'cancel'  )`, {
        prefix: "vux.actionsheet",
        lookup,
      })
    ).toBe('"取消"');
  });

  it("leaves runtime expressions alone", () => {
    // The old implementation replaced these with the literal text "item.label".
    for (const source of [
      "$t(item.label)",
      "$t(text.label || text)",
      "$t('week_day_' + index)",
      "$t(title)",
    ]) {
      expect(resolveStaticTranslations(source, { prefix: "vux.x", lookup })).toBe(source);
    }
  });

  it("leaves unknown keys alone and reports them once", () => {
    const missing: string[] = [];
    const source = `{{ $t('nope') }}`;

    expect(
      resolveStaticTranslations(source, {
        prefix: "vux.actionsheet",
        lookup,
        onMissing: (key) => missing.push(key),
      })
    ).toBe(source);
    expect(missing).toEqual(["vux.actionsheet.nope"]);
  });

  it("replaces every occurrence in one template", () => {
    const out = resolveStaticTranslations(`$t('cancel') $t('cancel')`, {
      prefix: "vux.actionsheet",
      lookup,
    });

    expect(out).toBe('"取消" "取消"');
  });

  it("matches the function name it is configured with", () => {
    const options = { prefix: "vux.actionsheet", lookup, functionName: "$tt" };

    expect(resolveStaticTranslations(`{{ $tt('cancel') }}`, options)).toBe(
      '{{ "取消" }}'
    );
    // Renaming must not leave the default spelling half-replaced.
    expect(resolveStaticTranslations(`{{ $t('cancel') }}`, options)).toBe(
      "{{ $t('cancel') }}"
    );
  });

  it("will not match a call whose name merely ends in the configured one", () => {
    // `t` is a suffix of `$t`; matching it would reach into the app's own calls.
    expect(
      resolveStaticTranslations(`{{ $t('cancel') }}`, {
        prefix: "vux.actionsheet",
        lookup,
        functionName: "t",
      })
    ).toBe("{{ $t('cancel') }}");
  });
});

describe("i18n template transform", () => {
  const VUX_FILE = "/app/node_modules/vux/src/components/actionsheet/index.vue";
  const X_INPUT = "/app/node_modules/vux/src/components/x-input/index.vue";
  /** Where `vux/src/locales/all.yml` is read from; see the fixture's README. */
  const root = path.resolve(__dirname, "fixtures/vux-mini");

  /** One transform instance: what it patched, and what it said while doing so. */
  function run(
    code: string,
    options: {
      plugins?: VuxLoaderPlugin[];
      filename?: string;
      /** Project root, i.e. which package the locale table comes from. */
      from?: string;
    } = {}
  ) {
    const { plugins = [], filename = VUX_FILE, from = root } = options;
    const logger = createRecorder();
    const config: Config = { root: from, ssr: false, componentMap: {}, plugins, logger };
    const block: BlockView = { type: "template", filename, content: code, attrs: {} };

    return {
      patch: createI18nTransform(config)(block, scopeOf(filename)),
      warnings: logger.messages,
    };
  }

  it("replaces keys under the component's own namespace", () => {
    // `vux.actionsheet.cancel` is a key in the fixture's locales/all.yml.
    expect(run("{{ $t('cancel') }}").patch).toEqual({ content: '{{ "取消" }}' });
  });

  it("leaves a key that has no translation, and reports it once", () => {
    // The fixture's x-input template references a key all.yml does not carry.
    const { patch, warnings } = run("{{ $t('unknown_key') }}", { filename: X_INPUT });

    expect(patch).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^no "zh-CN" translation for "vux.x-input.unknown_key"/);
  });

  it("gives up with a warning when the package ships no locale table", () => {
    const { patch, warnings } = run("{{ $t('cancel') }}", {
      from: path.resolve(__dirname, "fixtures/no-vux"),
    });

    expect(patch).toBeUndefined();
    expect(warnings.join("\n")).toMatch(/vux locales not found/);
  });

  it("leaves an app's own $t calls to vue-i18n", () => {
    expect(
      run("{{ $t('cancel') }}", { filename: "/app/src/pages/Home.vue" }).patch
    ).toBeUndefined();
  });

  it("resolves through a renamed translation function", () => {
    const plugins: VuxLoaderPlugin[] = [{ name: "i18n", vuxFunctionName: "$tt" }];

    expect(run("{{ $tt('cancel') }}", { plugins }).patch).toEqual({
      content: '{{ "取消" }}',
    });
    // Both spellings are checked: the configured one must win, the other stay.
    expect(run("{{ $t('cancel') }}", { plugins }).patch).toBeUndefined();
  });

  it("does nothing when vuxStaticReplace is false", () => {
    const plugins: VuxLoaderPlugin[] = [{ name: "i18n", vuxStaticReplace: false }];

    expect(run("{{ $t('cancel') }}", { plugins }).patch).toBeUndefined();
  });

  it("reports nothing when the template has no calls at all", () => {
    const { patch, warnings } = run("<div>plain markup</div>");

    expect(patch).toBeUndefined();
    expect(warnings).toEqual([]);
  });
});

describe("i18n custom block transform", () => {
  // `vue/compiler-sfc` is resolved from this repository, which depends on vue:
  // that one is a real dependency of the plugin, not part of the fixture.
  const compiler = resolveCompiler(process.cwd());

  function customBlock(filename: string) {
    const { customBlocks } = compileVue(
      compiler,
      filename,
      "<template><p/></template>\n<i18n>en: hi</i18n>"
    );
    const block = customBlocks[0];
    if (!block) throw new Error("no custom block parsed");

    const view: BlockView = {
      type: block.type,
      filename: block.filename,
      content: block.content,
      attrs: block.attrs,
    };

    return createI18nCustomBlockTransform()(view, scopeOf(filename));
  }

  it("drops i18n blocks coming from node_modules", () => {
    expect(
      customBlock("/app/node_modules/vux/src/components/actionsheet/index.vue")
    ).toEqual({ drop: true });
  });

  it("keeps i18n blocks from the app's own components", () => {
    expect(customBlock("/app/src/App.vue")).toBeUndefined();
  });
});
