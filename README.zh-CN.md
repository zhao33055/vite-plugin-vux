# vite-plugin-vux

在 Vite 项目中使用 [vux](https://github.com/airyland/vux)（Vue 2 移动端组件库）。

`vux` 是为 webpack + `vux-loader` 编写的。直接用 Vite 加载它的源码会失败：组件导入不带 `.vue` 扩展名、`<x-icon>` 根本没有可导入的实现、`$t()` 文案预设了 `vue-i18n` 已安装、`vux-xscroll` 只提供 UMD、部分文件同时混用 ESM 与 `require()`，而入口 `vux/index.js` 是个大 barrel，会把 160 多个组件全部拖进依赖图。这个插件把 `vux-loader` 原本做的事情搬进了 Vite 自己的流水线。

## 环境要求

| 依赖    | 版本                                          |
| ------- | --------------------------------------------- |
| `vite`  | `^5` \| `^6` \| `^7`                          |
| `vue`   | `^2.7`（使用 `vue/compiler-sfc`）             |
| `vux`   | `^2.9.2`（CI 覆盖 2.9.x 与 2.11.x）           |
| Node    | `>= 18`                                       |

## 安装

```bash
pnpm add -D vite-plugin-vux      # 或 npm i -D / yarn add -D
pnpm add vue@^2.7 vux            # 运行时依赖
```

## 快速开始

```js
// vite.config.js
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue2";
import vux from "vite-plugin-vux";

export default defineConfig({
  plugins: [
    vue(), // ← 必须在前
    vux(),
  ],
});
```

`vux()` 没有任何必填参数，上面这段就是完整配置。

**插件顺序很重要。** `@vitejs/plugin-vue2` 会把整个 SFC 编译成仍然保留 `App.vue` 这个 id 的模块，而按需导入的改写必须发生在这个「已编译」的模块上。如果把 `vux()` 写在 `vue()` 前面，`.vue` 文件会被静默跳过，开发服务器最终会加载整个 vux；插件检测到这种情况会输出：

```
[vite-plugin-vux] vux() is registered before vue(), so component imports inside .vue files are not rewritten. Put vue() first: plugins: [vue(), vux()].
```

组件按正常方式书写：

```vue
<script>
import { Group, XInput, XButton } from "vux";

export default {
  components: { Group, XInput, XButton },
};
</script>
```

每个导入名都会通过 vux 自带的 `vux/src/components/map.json` 被改写成单组件默认导入：

```js
import XInput from "vux/src/components/x-input/index.vue";
```

有两点需要特别注意：

- **组件名以 vux 自己的为准** —— `XButton`、`XInput`、`Actionsheet`、`Group`，而不是 `Button`、`Input`、`Icon`：这些 key 并不在 map 里。map 中不存在的名字会原样保留为 `vux` 导入并只告警一次，而不是悄悄变成 `vux/undefined`。
- **不需要全局注册，也不需要 `vux/dist/vux.css`。** 每个组件都自带 `<style lang="less">`，编译时已把 vux 的 `styles` 目录加入 less 的 `paths`，因此组件内部的 `@import 'variables'` 能正常解析。

## 配置项

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

| 参数       | 类型          | 默认值 | 说明                                                            |
| ---------- | ------------- | ------ | --------------------------------------------------------------- |
| `ssr`      | `boolean`     | `false`| 开启时所有模板保留 `<v-ssr>`、删除 `<v-no-ssr>`；关闭时相反。    |
| `plugins`  | `VuxLoaderPlugin[]` | `[]`   | 转换器描述对象，形状沿用 vux-loader 的插件定义。                 |

`VuxLoaderPlugin` 就是 1.x 导出的 `VuxPlugin`。旧名字读起来像「本插件提供的 Vite 插件」，而那恰好是 `vux()` 返回的四个插件；需要更具体名字的是这些 vux-loader 形状的描述对象。

本插件要说的话都不再自己写 `console`：告警统一交给创建构建时传入的 `Logger`，默认就是 console。要内嵌本插件、或把它的消息收集起来而不是打印，用 `buildVuxPlugins(options, logger)` —— 同样的四个插件，只是换个落点。

### `less-theme`

```js
{ name: "less-theme", path: "src/theme.less" }
```

该文件中声明的变量（会跟随 `@import`）被解析后作为 less 的 `modifyVars` 注入，因此它对**每一次** less 编译生效 —— 包括 vux 组件内部的样式。vux 自带的默认变量**不会**自动注入到你的样式文件里，用到什么就要自己声明。

无法成为合法 less 变量名的行（例如选择器行）会被跳过并告警。

### `style-parser`

```js
{ name: "style-parser", fn: (code) => code.replace(/#000/g, "#1a1a1a") }
```

在 less 编译之前改写 `<style lang="less">` 的内容，只有 less 代码块会传给 `fn`。

### `i18n`

```js
{
  name: "i18n",
  vuxStaticReplace: true,   // 默认 true
  vuxLocale: "zh-CN",       // 默认 "zh-CN"
  vuxFunctionName: "$t",    // 默认 "$t"
}
```

`vuxStaticReplace: true`（默认）时，**vux 自身模板**里的 `$t('key')` 会被替换成从 `vux/src/locales/all.yml` 读到的字面量，key 规则为 `vux.<组件名>.<key>`。这正是你可以不安装 `vue-i18n` 也能使用 `actionsheet`、`datetime`、`toast` 等组件的原因。设为 `false` 则保留为运行时查询，此时必须安装 `vue-i18n` 并载入 vux 的语言包。

`vuxFunctionName` 用于改变匹配的方法名，适用于 vux 模板被预处理成别的翻译方法的场景。

你自己的 `$t()` 不会被改写 —— 只有 vux 自身的字符串会被内联，且只有纯字符串字面量才替换（`$t(item.label)` 保持为运行时表达式）。

> vux-loader 的 `functionName`、`localeList`、`staticTranslations`、`staticReplace` 描述的都是对**业务代码**自身的字符串做替换，而在 Vite 下这依然是 `vue-i18n` 的职责。它们为了兼容性仍然被接收并有类型定义（这样 vux-loader 的配置仍能通过编译）；一旦真的设置，构建时会打印告警而不是静默忽略。

### `<x-icon>`

`vux/src/components/x-icon/` 里只有一个 `metas.yml`，组件 map 中也没有 `XIcon` —— 这个标签能显示，完全是因为 `vux-loader` 把它替换成了内联 SVG。本插件做同样的事，且同样作用于你自己的模板：

```vue
<x-icon type="ios-arrow-up" size="20"></x-icon>   <!-- 内联为 <svg> -->
<x-icon :type="currentIcon"></x-icon>              <!-- 原样保留，不渲染任何内容 -->
```

`type` 必须是**静态**值。绑定的 `:type` 在构建期无法确定，而运行时也没有对应组件可以兜底，因此不会渲染任何东西；请用 `v-if`/`v-html` 自行控制，或改用静态标签。

## 插件注册了什么

`vux()` 返回四个 Vite 插件：

| 插件                          | 阶段   | 职责                                                                          |
| ----------------------------- | ------ | ----------------------------------------------------------------------------- |
| `vite-plugin-vux:sfc`         | `pre`  | 重写原始 SFC，让 `@vitejs/plugin-vue2` 拿到已经规范化的块：删除依赖包内的 `<template lang="...">`、丢弃依赖包内的 `<i18n>` 块、内联 `<x-icon>`、静态解析 vux 的 `$t()`、应用 `less-theme` / `style-parser`。其 `config()` 钩子设置 less 的 `paths` 与 `modifyVars`、补充 `optimizeDeps.include`（vux 那些藏得很深的依赖），并通过 `\0` 前缀的虚拟模块提供已打包成 ESM 的 `vux-xscroll`。 |
| `vite-plugin-vux:patches`     | `pre`  | 针对 vux 包源码的修补：把「ESM 与 `require()` 混用」文件里的顶层 `const x = require('…')` 提升为 import —— 这类文件 Vite 的 CommonJS 处理会跳过（因为它忽略一切含 ESM 语法的文件）。纯 CommonJS 文件则刻意交给 Vite 处理。 |
| `vite-plugin-vux:resolver`    | `post` | 解析 vux 包内无扩展名的相对导入（`import '../inline-desc'` → `…/index.vue`）。它在 Vite 自身的解析之后运行，且只对「导入方位于 vux 内」的请求生效，因此你项目里的 `resolve.extensions` 保持原样。在 esbuild 预构建阶段（Vite 的解析器不会运行），同样的修补由一个 esbuild 钩子完成。 |
| `vite-plugin-vux:auto-import` | normal | 把 `import { X } from "vux"` 改写为每组件一个默认导入（基于 Babel AST 而非字符串匹配），未知名字各告警一次。 |

## 从 vux-loader 迁移

| webpack + vux-loader                                | Vite + vite-plugin-vux                             |
| --------------------------------------------------- | -------------------------------------------------- |
| `new VueLoaderPlugin()` + `vux-loader({...})`        | `vue()` + `vux()`                                   |
| `vux-loader` 的 `css_match` / `.vue` 样式处理         | 自动完成，组件自带 `<style>` 会被编译               |
| `{ name: 'less-theme', path }`                       | 形状不变，写进 `vux({ plugins: [...] })`            |
| `{ name: 'style-parser', fn }`                       | 形状不变                                            |
| `{ name: 'i18n', vuxStaticReplace, vuxLocale }`      | 形状不变，另支持 `vuxFunctionName`                  |
| `mapGet('vux/src/components/...')`                   | 不再需要，直接写常规导入即可                        |
| 只用部分组件时还要 `import 'vux/dist/vux.css'`        | 不再需要（如需全量样式仍可手动引入）                |

## 常见问题

**`Cannot find vux component map at .../vux/src/components/map.json`** —— Vite 实际解析出的 `root` 目录下没有安装 vux，或 `root` 指向了别处。组件 map、编译器、主题文件都以 Vite 的 `root` 为基准解析。

**开发时加载了上百个模块 / 产物里包含整个 vux** —— `vux()` 写在了 `vue()` 前面，见「快速开始」。

**`"XIcon" is not exported by vux/index.js`（或 `Button`、`Input`）** —— 这些名字不在 vux 的 map 里。请使用真实组件名，或使用带静态 `type` 的 `<x-icon>`。

**自己的 less 里报 `variable @font-size-small is undefined`** —— `less-theme` 只注入你声明的变量，不会把 vux 的默认变量前置到用户样式中。

**构建告警 `N require() remain inside function bodies`** —— 某个 vux 文件在函数体内调用 `require()`，无法提升为静态导入。通常仍能正常构建；如果该模块运行时报错，需要手工打补丁或为其添加 `optimizeDeps.include` 条目。

**Windows** —— 匹配前会把 id 统一成 `/`，因此 `\` 路径是被支持的；如果遇到例外，请带上出错的 id 提 issue。

## 开发

```bash
pnpm install
pnpm run dev            # rollup watch 构建
pnpm run build          # 产出 dist/（CJS + ESM + 类型 + 内置 xscroll）
pnpm run test           # vitest，读取 test/fixtures/vux-mini 夹具，不依赖真实 vux 包
pnpm run typecheck      # tsc -p tsconfig.test.json
pnpm run lint           # eslint flat config
pnpm run format         # prettier
```

单元测试读取 `test/fixtures/vux-mini` —— 一个按插件读取包的方式（`<root>/node_modules/vux/...`）搭起来的迷你包。那里测试变红，说明是本插件出了问题，而不是某个 vux 版本挪动了它要读的文件。

`playground/` 是一个可运行的 Vue 2 + vux 2.9.x 应用，用作端到端验证：

```bash
cd playground && pnpm install
pnpm run dev          # 开发服务器
pnpm run test:e2e     # 在仓库根目录执行：构建 playground
```

构建输出里的模块数与体积就是回归信号 —— 模块数若回到 700 左右，说明按需改写在某个环节失效了。

CI（`.github/workflows/ci.yml`）在 Node 18/20/22 上执行 lint、格式检查、类型检查、测试与构建，另外还有一次针对真实 vux（刻意选择更旧的 2.9.x）的 playground 构建。

## 贡献

Fork 仓库，为你的改动新建分支，提交附带清晰说明的 Pull Request。欢迎提 issue 报告问题或提出功能请求；涉及构建回归时，请附上 vux 版本和 `vite build` 输出的模块数。

## 许可证

MIT，详见 [LICENSE](./LICENSE)。
