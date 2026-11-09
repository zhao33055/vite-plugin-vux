# vite-plugin-vux

Use [vux](https://github.com/airyland/vux), the Vue 2 mobile component library, in a Vite project.

`vux` was written for webpack and `vux-loader`. Point Vite at its sources as-is and the build fails: imports without a `.vue` extension, `<x-icon>` with no implementation to import, `$t()` strings that assume `vue-i18n` is installed, a `vux-xscroll` dependency that ships UMD only, files that mix ESM with `require()`, and a barrel entry (`vux/index.js`) that pulls all 160+ components into the graph. This plugin does the work `vux-loader` used to do, inside Vite's own pipeline.

## Requirements

| Package | Version                     |
| ------- | --------------------------- |
| `vite`  | `^5` \| `^6` \| `^7`        |
| `vue`   | `^2.7` (uses `vue/compiler-sfc`) |
| `vux`   | `^2.9.2` (CI covers 2.9.x and 2.11.x) |
| Node    | `>= 18`                     |

## Installation

```bash
pnpm add -D vite-plugin-vux      # or: npm i -D / yarn add -D
pnpm add vue@^2.7 vux            # runtime dependencies
```

## Quick start

```js
// vite.config.js
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue2";
import vux from "vite-plugin-vux";

export default defineConfig({
  plugins: [
    vue(), // ← must come first
    vux(),
  ],
});
```

`vux()` takes no required options — the call above is a complete setup.

**Plugin order matters.** `@vitejs/plugin-vue2` compiles the whole SFC into the module that keeps the plain `App.vue` id, and it is that compiled module the auto-import rewrite needs to run on. If `vux()` is listed before `vue()`, `.vue` files are silently skipped and the dev server ends up loading all of vux; the plugin detects this and prints:

```
[vite-plugin-vux] vux() is registered before vue(), so component imports inside .vue files are not rewritten. Put vue() first: plugins: [vue(), vux()].
```

Then use components normally:

```vue
<script>
import { Group, XInput, XButton } from "vux";

export default {
  components: { Group, XInput, XButton },
};
</script>
```

Each imported name is resolved through vux's own `vux/src/components/map.json` into a single default import:

```js
import XInput from "vux/src/components/x-input/index.vue";
```

Two consequences worth knowing:

- **Names are vux's own** — `XButton`, `XInput`, `Actionsheet`, `Group`. Not `Button`, `Input` or `Icon`: those keys are not in the map. A name the map does not know is left as a `vux` import and reported once, rather than silently becoming `vux/undefined`.
- **No global registration and no `vux/dist/vux.css`.** Every component ships its own `<style lang="less">`, which is compiled with vux's `styles` directory added to less' `paths`, so `@import 'variables'` inside vux resolves.

## Options

```js
vux({
  ssr: false,
  plugins: [
    { name: "less-theme", path: "src/theme.less" },
    { name: "style-parser", fn: (code) => code },
    { name: "i18n", vuxStaticReplace: true, vuxLocale: "zh-CN" },
  ],
});
```

| Option      | Type          | Default | Description                                                    |
| ----------- | ------------- | ------- | -------------------------------------------------------------- |
| `ssr`       | `boolean`     | `false` | Keeps `<v-ssr>` and drops `<v-no-ssr>` in every template; the reverse when off. |
| `plugins`   | `VuxPlugin[]` | `[]`    | Transform descriptors, modelled on vux-loader's plugin objects. |

### `less-theme`

```js
{ name: "less-theme", path: "src/theme.less" }
```

Declarations in that file (following `@import`) are parsed and injected as less `modifyVars`, so they apply to **every** less compilation — including the styles inside vux's own components. Variables from vux's own default set are _not_ imported into your files automatically; declare what you use.

A variable that cannot be a less variable (a selector line, for instance) is skipped with a warning.

### `style-parser`

```js
{ name: "style-parser", fn: (code) => code.replace(/#000/g, "#1a1a1a") }
```

Rewrites the content of `<style lang="less">` blocks before less runs. Only less blocks are passed to `fn`.

### `i18n`

```js
{
  name: "i18n",
  vuxStaticReplace: true,   // default: true
  vuxLocale: "zh-CN",       // default: "zh-CN"
  vuxFunctionName: "$t",    // default: "$t"
}
```

With `vuxStaticReplace: true` (the default), the `$t('key')` calls inside **vux's own templates** are replaced with literals read from `vux/src/locales/all.yml`, keyed `vux.<component>.<key>`. That is what lets you use `actionsheet`, `datetime`, `toast` and friends without installing `vue-i18n` at all. Setting it to `false` keeps them as runtime lookups, so you do need `vue-i18n` with vux's locale file loaded.

`vuxFunctionName` sets the name those calls are matched against, for a build where vux's templates were preprocessed with a different translation helper.

Your own `$t()` calls are never touched — only vux's strings are inlined, and only when the key is a plain string literal (`$t(item.label)` stays a runtime expression).

> The vux-loader options `functionName`, `localeList`, `staticTranslations` and `staticReplace` all describe work on the **app's** own strings, which stays `vue-i18n`'s job under Vite. They are accepted and typed so a vux-loader config still compiles; set one and the build prints a warning instead of ignoring it.

### `<x-icon>`

`vux/src/components/x-icon/` contains nothing but `metas.yml`, and `XIcon` is not in the component map — the tag only renders because `vux-loader` replaced it with inline SVG. This plugin does the same, in your templates as well as in vux's:

```vue
<x-icon type="ios-arrow-up" size="20"></x-icon>   <!-- inlined as <svg> -->
<x-icon :type="currentIcon"></x-icon>              <!-- left as-is, renders nothing -->
```

A **static** `type` is required. A bound `:type` cannot be resolved at build time and there is no runtime component to fall back to, so it renders nothing; compute the icon name in a `v-if`/`v-html` or use a static tag instead.

## What the plugin registers

`vux()` returns four Vite plugins:

| Plugin                       | Phase  | Responsibility                                                                 |
| ---------------------------- | ------ | ------------------------------------------------------------------------------ |
| `vite-plugin-vux:sfc`        | `pre`  | Rewrites the raw SFC so `@vitejs/plugin-vue2` receives already-normalised blocks: drops `<template lang="...">` inside dependencies, discards `<i18n>` blocks from dependencies, inlines `<x-icon>`, statically resolves vux's `$t()` calls, applies `less-theme` / `style-parser`. Its `config()` hook sets less `paths` + `modifyVars`, lists `optimizeDeps.include` hints for vux's deeply-nested dependencies, and serves `vux-xscroll` from a bundled ESM copy through `\0`-prefixed virtual modules. |
| `vite-plugin-vux:patches`    | `pre`  | Source-level fixes for the vux package: hoists top-level `const x = require('…')` in files that mix ESM with `require()` — files Vite's CommonJS pass otherwise skips, because it ignores anything containing ESM syntax. Pure CommonJS files are deliberately left to Vite. |
| `vite-plugin-vux:resolver`   | `post` | Resolves the extension-less relative imports inside vux (`import '../inline-desc'` → `…/index.vue`). Runs after Vite's own resolution and only for importers inside vux, so your project's `resolve.extensions` is left exactly as you set it. During esbuild pre-bundling, where no Vite resolver runs, the same fix is applied by an esbuild hook instead. |
| `vite-plugin-vux:auto-import`| normal | Rewrites `import { X } from "vux"` into one default import per component (Babel AST, not string matching), and warns once per unknown name. |

## Migration from vux-loader

| webpack + vux-loader                                | Vite + vite-plugin-vux                             |
| --------------------------------------------------- | -------------------------------------------------- |
| `new VueLoaderPlugin()` + `vux-loader({...})`        | `vue()` + `vux()`                                   |
| `vux-loader` `css_match` / `.vue` style handling     | automatic; each component's own `<style>` compiles  |
| `{ name: 'less-theme', path }`                       | identical shape inside `vux({ plugins: [...] })`    |
| `{ name: 'style-parser', fn }`                       | identical shape                                     |
| `{ name: 'i18n', vuxStaticReplace, vuxLocale }`      | identical shape, plus `vuxFunctionName`             |
| `mapGet('vux/src/components/...')`                   | not needed — plain relative/specifier imports work  |
| `vux/dist/vux.css` import for partial usage          | not needed; still available for full-style imports  |

## Troubleshooting

**`Cannot find vux component map at .../vux/src/components/map.json`** — vux is not installed in the project Vite resolves as `root`, or `root` points somewhere unexpected. The map, the compiler and the theme file are all resolved against Vite's `root`.

**The dev server loads hundreds of modules / the bundle contains all of vux** — `vux()` is registered before `vue()`; see Quick start.

**`"XIcon" is not exported by vux/index.js`** (or `Button`, `Input`) — those names are not in vux's map. Use the component's real name, or `<x-icon type="...">` with a static type.

**`variable @font-size-small is undefined` in your own less** — `less-theme` only injects the variables your theme file declares; vux's defaults are not prepended to user styles.

**A build warning says `N require() remain inside function bodies`** — a vux file calls `require()` from inside a function, which cannot become a static import. The build usually still works; if that module fails at runtime, it needs a manual patch or an `optimizeDeps.include` entry.

**Windows** — ids are normalised to `/` before matching, so `\` paths are handled; if you hit a case that is not, open an issue with the id.

## Development

```bash
pnpm install
pnpm run dev            # rollup watch build
pnpm run build          # dist/ (CJS + ESM + types + bundled xscroll)
pnpm run test           # vitest, against the test/fixtures/vux-mini fixture
pnpm run typecheck      # tsc -p tsconfig.test.json
pnpm run lint           # eslint flat config
pnpm run format         # prettier
```

The unit tests read `test/fixtures/vux-mini` — a miniature package laid out the way the plugin reads one (`<root>/node_modules/vux/...`). A red test there means this plugin broke, not that a vux release moved a file underneath it.

`playground/` is a runnable Vue 2 + vux 2.9.x app used as the end-to-end check:

```bash
cd playground && pnpm install
pnpm run dev            # dev server
pnpm run test:e2e       # from the repo root: builds the playground
```

The module and byte counts in the build output are the regression signal — a jump back to ~700 modules means the auto-import rewrite stopped applying somewhere.

CI (`.github/workflows/ci.yml`) runs lint, format, typecheck, tests and build on Node 18/20/22, plus a playground build against a real — and deliberately older — vux release.

## Contributing

Fork the repository, create a branch for your change, and open a pull request with a clear description. Bug reports and feature requests are welcome as issues — for build regressions, include the vux version and the `vite build` module count.

## License

MIT — see [LICENSE](./LICENSE).
