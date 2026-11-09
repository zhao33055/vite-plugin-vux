import { describe, expect, it } from "vitest";

import {
  createI18nCustomBlockTransform,
  createI18nTransform,
  resolveStaticTranslations,
} from "../src/i18n";
import { compileVue, resolveCompiler } from "../src/compiler";
import type { BlockView } from "../src/contracts";
import { scopeOf } from "../src/vux/paths";
import type { Config, VuxPlugin } from "../src/types";

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

  function run(plugins: VuxPlugin[], code: string, filename = VUX_FILE) {
    const config: Config = { root: process.cwd(), ssr: false, componentMap: {}, plugins };
    const block: BlockView = { type: "template", filename, content: code, attrs: {} };

    return createI18nTransform(config)(block, scopeOf(filename));
  }

  it("replaces keys under the component's own namespace", () => {
    // `vux.actionsheet.cancel` is in the installed package's locales/all.yml.
    expect(run([], "{{ $t('cancel') }}")).toEqual({ content: '{{ "取消" }}' });
  });

  it("leaves an app's own $t calls to vue-i18n", () => {
    expect(run([], "{{ $t('cancel') }}", "/app/src/pages/Home.vue")).toBeUndefined();
  });

  it("resolves through a renamed translation function", () => {
    const renamed: VuxPlugin[] = [{ name: "i18n", vuxFunctionName: "$tt" }];

    expect(run(renamed, "{{ $tt('cancel') }}")).toEqual({ content: '{{ "取消" }}' });
    // Both spellings are checked: the configured one must win, the other stay.
    expect(run(renamed, "{{ $t('cancel') }}")).toBeUndefined();
  });

  it("does nothing when vuxStaticReplace is false", () => {
    const dynamic: VuxPlugin[] = [{ name: "i18n", vuxStaticReplace: false }];

    expect(run(dynamic, "{{ $t('cancel') }}")).toBeUndefined();
  });

  it("reports nothing when the template has no calls at all", () => {
    expect(run([], "<div>plain markup</div>")).toBeUndefined();
  });
});

describe("i18n custom block transform", () => {
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
