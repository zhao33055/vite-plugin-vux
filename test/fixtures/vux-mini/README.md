# `vux-mini`

A miniature app with a miniature vux installed in it, used as the fixture for
the unit tests. It exists so that a test failure means "this plugin broke", not
"the installed vux package changed under us".

The layout is not decoration: the plugin resolves everything as
`<root>/node_modules/vux/...`, so the fixture has to wear exactly that shape,
including the committed `node_modules` directory (see the negation in
`.gitignore`). Prettier and ESLint ignore any `node_modules`, which is why the
files in here are formatted by hand.

```text
theme.less              an app's own theme file (`less-theme` option)
node_modules/vux/
  src/components/map.json     the component table on-demand imports read
  src/components/*/index.vue  components that exercise each SFC transform
  src/locales/all.yml         the strings i18n statically replaces
  src/styles/variable.less    the less variables injected into every build
  src/icons/*.svg             the markup <x-icon> is replaced with
```

Each component covers a specific behaviour, and the comments in them say which:

| Component                 | Covers                                                        |
| ------------------------- | ------------------------------------------------------------- |
| `actionsheet/index.vue`   | static `$t`, runtime `$t`, `<x-icon>`, `<i18n>`, less `@import` |
| `datetime/index.vue`      | a translation inside a double-quoted attribute (quote parity)  |
| `x-input/index.vue`       | a key that is absent from `all.yml` (reported, not invented)   |
| `x-switch/index.vue`      | an extension-less component import (the resolver plugin's job) |
| `x-button/index.vue`      | an auto-import target                                          |

The real vux package is still what the playground build runs against - see
`playground/`. This fixture keeps the unit tests honest about their own logic;
the playground is what says the two still agree with the actual package.
