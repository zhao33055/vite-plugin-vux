import { describe, expect, it } from "vitest";

import {
  createI18nTransformPluginForCustomBlock,
  resolveStaticTranslations,
} from "../src/i18n";
import { compileVue, resolveCompiler } from "../src/compiler";
import type { Block } from "../src/compiler";
import type { Config } from "../src/types";

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
});

describe("i18n custom block plugin", () => {
  const compiler = resolveCompiler(process.cwd());
  const config: Config = {
    root: process.cwd(),
    ssr: false,
    componentMap: {},
    plugins: [],
  };

  it("destroys i18n blocks coming from vux", () => {
    const { customBlocks } = compileVue(
      compiler,
      "/app/node_modules/vux/src/components/actionsheet/index.vue",
      "<template><p/></template>\n<i18n>en: hi</i18n>"
    );
    const plugin = createI18nTransformPluginForCustomBlock("i18n-block", config);

    expect(plugin.fn(customBlocks[0] as Block)).toMatchObject({ destroyed: true });
  });

  it("keeps i18n blocks from user projects", () => {
    const { customBlocks } = compileVue(
      compiler,
      "/app/src/App.vue",
      "<template><p/></template>\n<i18n>en: hi</i18n>"
    );
    const plugin = createI18nTransformPluginForCustomBlock("i18n-block", config);

    expect(plugin.fn(customBlocks[0] as Block)).toBeUndefined();
  });
});
