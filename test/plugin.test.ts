import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import vux, { createVuxContext } from "../src/index";

const root = process.cwd();

function pluginByName(name: string) {
  const plugins = vux();
  const plugin = plugins.find((p) => p.name === name);
  if (!plugin) throw new Error(`plugin ${name} not found`);
  return plugin;
}

/** Calls a transform hook with the minimal `this` Vite provides. */
function transform(plugin: unknown, code: string, id: string, warnings: string[] = []) {
  const hook = (plugin as { transform: (this: unknown, c: string, i: string) => unknown })
    .transform;
  return hook.call({ warn: (m: string) => warnings.push(String(m)) }, code, id);
}

describe("plugin factory", () => {
  it("can be called with no options, as the README documents", () => {
    // Regression: `options.plugins` was read off an undefined `options`.
    expect(() => vux()).not.toThrowError();
    expect(vux()).toHaveLength(3);
  });

  it("registers the three plugins in the required order", () => {
    expect(vux().map((p) => p.name)).toEqual([
      "vite-plugin-vux:sfc",
      "vite-plugin-vux:patches",
      "vite-plugin-vux:auto-import",
    ]);
  });

  it("puts the SFC and patch plugins before the vue plugin", () => {
    const [sfc, patches, autoImport] = vux();

    expect(sfc.enforce).toBe("pre");
    expect(patches.enforce).toBe("pre");
    expect(autoImport.enforce).toBeUndefined();
  });

  it("exposes less variable injection and dependency hints through config", async () => {
    const sfc = pluginByName("vite-plugin-vux:sfc");
    const hook = sfc.config as (this: unknown, c: unknown) => Record<string, any>;
    const result = hook.call({}, {});

    // `.vue` has to be *added* to Vite's defaults, not swapped in for them:
    // replacing the list breaks extension-less .ts/.tsx/.jsx/.json imports.
    expect(result.resolve.extensions).toEqual([
      ".mjs",
      ".js",
      ".mts",
      ".ts",
      ".jsx",
      ".tsx",
      ".json",
      ".vue",
    ]);
    expect(result.css.preprocessorOptions.less.paths[0]).toMatch(/styles$/);
    expect(result.optimizeDeps.include).toContain("vux > big.js");
  });

  it("resolves the component map against vite's root, not the cwd", () => {
    const sfc = pluginByName("vite-plugin-vux:sfc");
    const hook = sfc.config as (this: unknown, c: unknown) => unknown;
    const otherRoot = path.resolve(__dirname, "fixtures");

    // The fixtures directory has no vux in it. If `root` were ignored the map
    // would resolve from the repo root instead and nothing would throw.
    expect(() => hook.call({}, { root: otherRoot })).toThrowError(
      /Cannot find vux component map/
    );
  });
});

describe("xscroll virtual modules", () => {
  const sfc = pluginByName("vite-plugin-vux:sfc");
  const resolveId = sfc.resolveId as (this: unknown, id: string) => { id: string } | null;
  const load = sfc.load as (this: unknown, id: string) => string | null;

  const specifiers: Array<[string, string]> = [
    ["vux-xscroll/build/cmd/xscroll.js", "XScroll"],
    ["vux-xscroll/build/cmd/plugins/pulldown", "Pulldown"],
    ["vux-xscroll/build/cmd/plugins/pullup", "Pullup"],
  ];

  it.each(specifiers)("resolves %s to a virtual module", (id, exportName) => {
    const resolved = resolveId.call({}, id);

    // A `\0`-prefixed virtual id: no filesystem path ever reaches the output,
    // and nothing on disk can collide with it.
    expect(resolved?.id).toBe(`\0vux-xscroll:${id}`);
    const contents = load.call({}, resolved!.id) ?? "";
    expect(contents).toContain(`export { ${exportName} as default } from`);
    expect(contents).toContain("xscroll-bundle.js");
  });

  it("ships the bundle the virtual module re-exports", () => {
    const resolved = resolveId.call({}, "vux-xscroll/build/cmd/xscroll.js");
    const contents = load.call({}, resolved!.id) ?? "";
    const bundle = contents.match(/from "(.*)"/s)?.[1]?.replace(/\\/g, "/");

    expect(bundle).toBeDefined();
    expect(path.basename(bundle ?? "")).toBe("xscroll-bundle.js");
  });

  it("leaves unrelated imports alone", () => {
    expect(resolveId.call({}, "vue")).toBe(null);
    expect(load.call({}, "/app/src/main.js")).toBe(null);
  });
});

describe("SFC transform on real vux sources", () => {
  const sfc = pluginByName("vite-plugin-vux:sfc");
  const ctx = createVuxContext({}, root);

  it("inlines icons and resolves i18n inside a vux component", () => {
    const file = path.resolve(
      root,
      "node_modules/vux/src/components/actionsheet/index.vue"
    );
    const code = fs.readFileSync(file, "utf-8");

    const out = transform(sfc, code, file) as string;

    expect(typeof out).toBe("string");
    // i18n: `$t('cancel')` becomes a literal, and the <i18n> block disappears.
    expect(out).not.toContain("$t('cancel')");
    expect(out).not.toContain("<i18n>");
    expect(ctx.config.componentMap.Actionsheet).toBeDefined();
  });

  it("keeps bound attributes parseable when inlining translations", () => {
    // datetime/index.vue carries `:data-confirm-text="$t('confirm_text')"`.
    // The literal used to be emitted with double quotes, which closed the
    // attribute early and made the Vue template compiler drop the element.
    const file = path.resolve(root, "node_modules/vux/src/components/datetime/index.vue");
    const out = transform(sfc, fs.readFileSync(file, "utf-8"), file) as string;

    expect(out).toContain(`:data-confirm-text="'`);
    expect(out).not.toContain('=""');
    expect(out).not.toContain("$t(");
  });

  it("inlines x-icon in user templates too", () => {
    // vux has no `XIcon` component to import: the tag only renders because it is
    // replaced with SVG markup, in the app's own templates included.
    const code = [
      "<template>",
      "  <div>",
      '    <x-icon type="ios-arrow-up"></x-icon>',
      '    <x-icon :type="current"></x-icon>',
      "  </div>",
      "</template>",
    ].join("\n");

    const out = transform(sfc, code, "/app/src/pages/Home.vue") as string;

    expect(out).toContain("vux-x-icon-ios-arrow-up");
    expect(out).not.toContain('type="ios-arrow-up"');
    // A bound type is a runtime value and stays a component call.
    expect(out).toContain(':type="current"');
  });

  it("leaves user project i18n and script content alone", () => {
    const code = [
      "<template>",
      '  <p>{{ $t("hello") }}</p>',
      "</template>",
      "<script>",
      "export default { name: 'Home' }",
      "</script>",
    ].join("\n");

    const out = transform(sfc, code, "/app/src/pages/Home.vue") as string;

    // Only vux's own strings are statically replaced by default.
    expect(out).toContain('$t("hello")');
    expect(out).toContain("export default { name: 'Home' }");
  });

  it("skips vue sub-requests, which belong to @vitejs/plugin-vue2", () => {
    expect(
      transform(sfc, "export default {}", "/app/src/App.vue?vue&type=script&lang.js")
    ).toBe(null);
  });
});

describe("vux source patches", () => {
  const patches = pluginByName("vite-plugin-vux:patches");

  it("adds the .vue extension to vux's extension-less imports", () => {
    const id = "/app/node_modules/vux/src/plugins/loading/index.js";
    const out = transform(patches, `import C from '../../components/loading'`, id);

    expect((out as { code: string }).code).toContain(
      "../../components/loading/index.vue"
    );
  });

  it("matches windows-style ids, which the previous string compare never did", () => {
    const id = "C:\\app\\node_modules\\vux\\src\\plugins\\loading\\index.js";
    const out = transform(patches, `import C from '../../components/loading'`, id);

    expect((out as { code: string }).code).toContain("/index.vue");
  });

  it("ignores user files and assets", () => {
    expect(transform(patches, `import C from './x'`, "/app/src/main.js")).toBe(null);
    expect(transform(patches, ".a{}", "/app/node_modules/vux/src/styles/a.less")).toBe(
      null
    );
  });
});

describe("auto-import transform", () => {
  const autoImport = pluginByName("vite-plugin-vux:auto-import");

  it("rewrites vux imports in user scripts", () => {
    const out = transform(
      autoImport,
      "import { XButton, XInput } from 'vux'\nexport default { XButton, XInput }",
      "/app/src/main.js"
    ) as { code: string };

    expect(out.code).toContain("vux/src/components/x-button/index.vue");
    expect(out.code).toContain("vux/src/components/x-input/index.vue");
    expect(out.code).not.toMatch(/from\s*["']vux["']/);
  });

  it("runs on vue script sub-requests", () => {
    const out = transform(
      autoImport,
      "import { XButton } from 'vux'\nexport default { components: { XButton } }",
      "/app/src/App.vue?vue&type=script&lang.js"
    ) as { code: string };

    expect(out.code).toContain("vux/src/components/x-button/index.vue");
  });

  it("keeps unknown names as a vux import and warns once per name", () => {
    const warnings: string[] = [];
    const out = transform(
      autoImport,
      // `NotAComponent` is not in vux's map.json; it must not become undefined.
      "import { XButton, NotAComponent } from 'vux'\nexport default { XButton, NotAComponent }",
      "/app/src/main.js",
      warnings
    ) as { code: string };

    expect(out.code).toContain("vux/src/components/x-button/index.vue");
    expect(out.code).toMatch(/import\s*\{\s*NotAComponent\s*\}\s*from\s*["']vux["']/);
    expect(warnings.filter((w) => w.includes("NotAComponent"))).toHaveLength(1);
  });

  it("leaves files without a vux import untouched", () => {
    expect(
      transform(
        autoImport,
        "import { createApp } from 'vue'\ncreateApp()",
        "/app/src/main.js"
      )
    ).toBe(null);
  });

  it("rewrites the compiled SFC module, not just plain scripts", () => {
    // @vitejs/plugin-vue2 emits compiled output under the plain `App.vue` id.
    // Rewriting it is what keeps dev mode from pulling in all of vux.
    const out = transform(
      autoImport,
      "import { XButton } from 'vux'\nconst _sfc_main = { components: { XButton } }\nexport default _sfc_main",
      "/app/src/App.vue"
    ) as { code: string };

    expect(out.code).toContain("vux/src/components/x-button/index.vue");
  });

  it("never babel-parses a raw SFC", () => {
    // Happens when vux() is registered before vue(); the guard keeps this hook
    // from trying to parse markup as JavaScript.
    expect(
      transform(
        autoImport,
        "<template><p/></template>\n<script>import { XButton } from 'vux'</script>",
        "/app/src/App.vue"
      )
    ).toBe(null);
  });

  it("skips assets and the vux package itself", () => {
    expect(
      transform(autoImport, "import { XButton } from 'vux'", "/app/src/style.css")
    ).toBe(null);
    expect(
      transform(
        autoImport,
        "import { XButton } from 'vux'",
        "/app/node_modules/vux/src/a.js"
      )
    ).toBe(null);
  });
});
