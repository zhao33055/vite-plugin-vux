import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createRecorder } from "./helpers/recorder";
import vux, { buildVuxPlugins, createVuxContext, type Logger } from "../src/index";

/** See `test/fixtures/vux-mini/README.md` - nothing here reads the real package. */
const root = path.resolve(__dirname, "fixtures/vux-mini");

/** A project root with no vux installed, for the failure paths. */
const noVuxRoot = path.resolve(__dirname, "fixtures/no-vux");

/**
 * The four plugins, with their context already resolved against `root`.
 *
 * The context is lazy because Vite only announces the project root through
 * `config()`; calling that hook first is exactly what a real build does, and it
 * is what stops the plugins from falling back to this repository's own
 * `node_modules`.
 */
function pluginsAt(
  dir: string,
  options: Parameters<typeof buildVuxPlugins>[0] = {},
  logger?: Logger
) {
  const plugins = buildVuxPlugins(options, logger);
  const config = plugins[0].config as (this: unknown, c: unknown) => unknown;
  config.call({}, { root: dir });
  return plugins;
}

function pluginByName(name: string, dir = root) {
  const plugin = pluginsAt(dir).find((p) => p.name === name);
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
    expect(vux()).toHaveLength(4);
  });

  it("registers the plugins in the required order", () => {
    expect(vux().map((p) => p.name)).toEqual([
      "vite-plugin-vux:sfc",
      "vite-plugin-vux:patches",
      "vite-plugin-vux:resolver",
      "vite-plugin-vux:auto-import",
    ]);
  });

  it("puts the SFC and patch plugins before the vue plugin", () => {
    const [sfc, patches, resolver, autoImport] = vux();

    expect(sfc.enforce).toBe("pre");
    expect(patches.enforce).toBe("pre");
    // The resolver has to come after Vite's own: it only handles what is left.
    expect(resolver.enforce).toBe("post");
    expect(autoImport.enforce).toBeUndefined();
  });

  it("exposes less variable injection and dependency hints through config", () => {
    const sfc = pluginByName("vite-plugin-vux:sfc");
    const hook = sfc.config as (this: unknown, c: unknown) => Record<string, any>;
    const result = hook.call({}, { root });

    // The plugin must not touch module resolution for the host project at all:
    // adding `.vue` to `resolve.extensions` changes how *their* `./x` imports
    // resolve. vux-internal extension-less imports are the resolver plugin's job.
    expect(result.resolve).toBeUndefined();
    expect(result.css.preprocessorOptions.less.paths[0]).toMatch(/styles$/);
    expect(result.optimizeDeps.include).toContain("vux > big.js");
  });

  it("warns about i18n options that are accepted but not implemented", () => {
    const logger = createRecorder();

    pluginsAt(
      root,
      {
        plugins: [{ name: "i18n", staticReplace: true, functionName: "$tt" }],
      },
      logger
    );

    const message = logger.messages.join("\n");
    expect(message).toMatch(/staticReplace/);
    expect(message).toMatch(/functionName/);
    // An option that does work must not appear in the complaint.
    expect(message).not.toMatch(/vuxLocale/);
  });

  it("says nothing about i18n options that are implemented", () => {
    const logger = createRecorder();

    pluginsAt(root, { plugins: [{ name: "i18n", vuxLocale: "en" }] }, logger);

    expect(logger.messages).toEqual([]);
  });

  it("warns when this plugin is registered before the vue plugin", () => {
    // `configResolved` is typed with `this: void`, so the ordering complaint has
    // to reach the build's logger - which is also what makes it assertable.
    const logger = createRecorder();
    const plugins = pluginsAt(root, {}, logger);
    const autoImport = plugins.find(
      (plugin) => plugin.name === "vite-plugin-vux:auto-import"
    );
    const configResolved = autoImport?.configResolved as (
      this: unknown,
      resolved: unknown
    ) => void;

    configResolved.call(
      {},
      {
        plugins: [
          ...plugins.map((plugin) => ({ name: plugin.name })),
          { name: "vite:vue2" },
        ],
      }
    );

    expect(logger.messages.join("\n")).toMatch(/vux\(\) is registered before vue\(\)/);
  });

  it("says nothing about plugin order when vue() comes first", () => {
    const logger = createRecorder();
    const plugins = pluginsAt(root, {}, logger);
    const autoImport = plugins.find(
      (plugin) => plugin.name === "vite-plugin-vux:auto-import"
    );
    const configResolved = autoImport?.configResolved as (
      this: unknown,
      resolved: unknown
    ) => void;

    configResolved.call(
      {},
      {
        plugins: [
          { name: "vite:vue2" },
          ...plugins.map((plugin) => ({ name: plugin.name })),
        ],
      }
    );

    expect(logger.messages).toEqual([]);
  });

  it("resolves the component map against vite's root, not the cwd", () => {
    // A fresh factory on purpose: the context is memoised per plugin instance,
    // so one seeded with the fixture root would hide the failure sought here.
    const sfc = vux()[0];
    const hook = sfc.config as (this: unknown, c: unknown) => unknown;

    // `no-vux` has no vux in it. If `root` were ignored the map would resolve
    // from this repository instead, and nothing would throw.
    expect(() => hook.call({}, { root: noVuxRoot })).toThrowError(
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

describe("SFC transform on the fixture package", () => {
  const sfc = pluginByName("vite-plugin-vux:sfc");
  const ctx = createVuxContext({}, root);

  /** Hands a fixture component to the transform the way Vite would. */
  function transformComponent(component: string) {
    const file = path.resolve(root, "node_modules/vux/src/components", component);

    return transform(sfc, fs.readFileSync(file, "utf-8"), file) as string;
  }

  it("inlines icons and resolves i18n inside a vux component", () => {
    const out = transformComponent("actionsheet/index.vue");

    // The static key becomes a literal, and the `<i18n>` block - only ever
    // read by `vue-i18n-loader` - disappears with it.
    expect(out).toContain('{{ cancelText || "取消" }}');
    expect(out).not.toContain("<i18n>");
    // A runtime lookup is left for vue-i18n, which is the whole point.
    expect(out).toContain("$t(text.label || text)");
    expect(out).toContain("vux-x-icon-ios-arrow-up");
    expect(out).not.toContain("<x-icon");
    expect(ctx.config.componentMap.Actionsheet).toBeDefined();
  });

  it("keeps bound attributes parseable when inlining translations", () => {
    // datetime/index.vue carries `:data-confirm-text="$t('confirm_text')"`.
    // The literal used to be emitted with double quotes, which closed the
    // attribute early and made the Vue template compiler drop the element.
    const out = transformComponent("datetime/index.vue");

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

  it("hoists require() out of the files that mix ESM and CommonJS", () => {
    const id = "/app/node_modules/vux/src/components/picker/scroller.js";
    const code = [
      "const Animate = require('./animate')",
      "export default { created() { Animate.run() } }",
    ].join("\n");

    const out = transform(patches, code, id) as { code: string };

    expect(out.code).toContain("import Animate from './animate'");
  });

  it("matches windows-style ids, which the previous string compare never did", () => {
    const id = "C:\\app\\node_modules\\vux\\src\\components\\picker\\scroller.js";

    const out = transform(patches, "const a = require('./a')\nexport default {}", id) as {
      code: string;
    };

    expect(out.code).toContain("import a from './a'");
  });

  it("ignores user files and assets", () => {
    expect(transform(patches, `import C from './x'`, "/app/src/main.js")).toBe(null);
    expect(transform(patches, ".a{}", "/app/node_modules/vux/src/styles/a.less")).toBe(
      null
    );
  });
});

describe("extension-less imports inside vux", () => {
  const resolver = pluginByName("vite-plugin-vux:resolver");

  /** `existing` stands in for the files that are actually on disk. */
  function resolveId(
    source: string,
    importer: string | undefined,
    existing: string[] = []
  ) {
    const resolved: string[] = [];
    const context = {
      resolve: (candidate: string) => {
        resolved.push(candidate);
        return Promise.resolve(existing.includes(candidate) ? { id: candidate } : null);
      },
    };
    const hook = resolver.resolveId as (
      this: unknown,
      source: string,
      importer: string | undefined,
      options: unknown
    ) => Promise<{ id: string } | null>;

    return {
      result: hook.call(context, source, importer, {}),
      tried: resolved,
    };
  }

  const VUX_IMPORTER = "/app/node_modules/vux/src/components/x-switch/index.vue";

  it("resolves a component directory to its index.vue", async () => {
    // Regression: `../inline-desc` from x-switch was unresolvable once the
    // app-wide `.vue` extension was dropped.
    const { result } = resolveId("../inline-desc", VUX_IMPORTER, [
      "../inline-desc/index.vue",
    ]);

    await expect(result).resolves.toEqual({ id: "../inline-desc/index.vue" });
  });

  it("also tries a sibling .vue file", async () => {
    const { result } = resolveId("../foo", VUX_IMPORTER, ["../foo.vue"]);

    await expect(result).resolves.toEqual({ id: "../foo.vue" });
  });

  it("handles windows-style importers", async () => {
    const { result } = resolveId(
      "../inline-desc",
      "C:\\app\\node_modules\\vux\\src\\components\\x-switch\\index.vue",
      ["../inline-desc/index.vue"]
    );

    await expect(result).resolves.toEqual({ id: "../inline-desc/index.vue" });
  });

  it("never touches resolution for anyone outside vux", async () => {
    for (const importer of ["/app/src/App.vue", "/app/src/main.js", undefined]) {
      const { result, tried } = resolveId("./x", importer);

      await expect(result).resolves.toBe(null);
      expect(tried).toEqual([]);
    }
  });

  it("declines package and absolute specifiers", async () => {
    const { result, tried } = resolveId("vux", VUX_IMPORTER);

    await expect(result).resolves.toBe(null);
    expect(tried).toEqual([]);
  });

  it("declines when neither candidate exists", async () => {
    const { result, tried } = resolveId("./animate", VUX_IMPORTER);

    // A `./animate.js` file is resolved by Vite itself; probing both candidates
    // and returning null must not turn into a false positive.
    await expect(result).resolves.toBe(null);
    expect(tried).toEqual(["./animate/index.vue", "./animate.vue"]);
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
