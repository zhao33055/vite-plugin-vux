import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFilter, type Plugin } from "vite";
import stripComments from "strip-comments";

import { getComponentMap, getStylePath, getThemeVariables } from "./vuxApi";
import {
  initCompiler,
  compileVue,
  generateVue,
  transformCustomBlocks,
  transformScript,
  transformStyles,
  transformTemplate,  
} from "./compiler";
import { parseRequest, isJavaScriptFile, inNodeModules } from "./utils/query";
import { createStyleTransformPlugin } from "./style";
import { createSsrTransformPlugin } from "./ssr";
import { createXiconTransformPlugin, createTemplateAtrrsTransformPlugin } from "./icon";
import { createI18nTransformPluginFor$t, createI18nTransformPluginForCustomBlock } from "./i18n";

export interface VuxOptions {
  ssr?: boolean;
  plugins: Plugin[];
}

export interface Config {
  root: string;
  ssr: VuxOptions["ssr"];
  componentMap: [string, string];
  plugins: VuxOptions["plugins"];
}

export default function (options: VuxOptions): Plugin[] {
  const root = process.cwd();
  const ssr = !!options.ssr;
  const componentMap = getComponentMap(root);
  const plugins = options.plugins || [];
  const stylePath = getStylePath(root);
  const themeVariables = getThemeVariables(root, plugins);

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const config: Config = {
    root,
    ssr,
    componentMap,
    plugins,
  };

  const vueFilter = createFilter(/\.vue$/);

  const styleTransformPlugin = createStyleTransformPlugin("style-parser", config);
  const ssrTransformPlugin = createSsrTransformPlugin("ssr", config);
  const xiconTransformPlugin = createXiconTransformPlugin("x-icon", config);
  const templateAtrrsTransformPlugin = createTemplateAtrrsTransformPlugin("template-attrs", config);
  const i18nTransformPluginFor$t = createI18nTransformPluginFor$t("i18n-t", config);
  const i18nTransformPluginForCustomBlock = createI18nTransformPluginForCustomBlock("i18n-custom-block", config);

  initCompiler(root);

  return [{
    name: "vite-plugin-vux:pre",
    enforce: "pre",
    config(config) {
      return {
        resolve: {
          extensions: [".js", ".vue"],
        },
        css: {
          preprocessorOptions: {
            less: {
              paths: [stylePath],
              modifyVars: themeVariables,
            }
          }
        },
        optimizeDeps: {
          include: [
            "vux > lodash.debounce",
            "vux > array-filter",
            "vux > array-find",
            "vux > array-map",
            "vux > array-shuffle",
            "vux > autosize",
            "vux > countup.js",
            "vux > object-assign",
            "vux > x-photoswipe/dist/photoswipe",
            "vux > x-photoswipe/dist/photoswipe-ui-default",
            "vux > qr.js/lib/QRCode",
            "vux > qr.js/lib/ErrorCorrectLevel",
            "vux > shake.js",
            "vux > @antv/f2",
            "vux > vux-blazy",
            "vux > vanilla-masker",
            "vux > validator/lib/isEmail",
            "vux > validator/lib/isMobilePhone",
            "vux > big.js"
            // "vux > vux-xscroll/build/cmd/xscroll.js",
            // "vux > vux-xscroll/build/cmd/plugins/pulldown",
            // "vux > vux-xscroll/build/cmd/plugins/pullup",
          ],
          esbuildOptions: {
            plugins: [{
              name: "resolve-index",
              setup(build) {

                // build.onResolve({ filter: /x-photoswipe\/dist\/photoswipe/ }, (args) => ({ path: "vux___x-photoswipe_dist_photoswipe" }));
                // build.onResolve({ filter: /x-photoswipe\/dist\/photoswipe-ui-default/ }, (args) => ({ path: "vux___x-photoswipe_dist_photoswipe-ui-default" }));
                // build.onResolve({ filter: /qr.js\/lib\/QRCode/ }, (args) => ({ path: "vux___qr__js_lib_QRCode" }));
                // build.onResolve({ filter: /qr.js\/lib\/ErrorCorrectLevel/ }, (args) => ({ path: "vux___qr__js_lib_ErrorCorrectLevel" }));

                // build.onResolve({ filter: /vux-xscroll\/build\/cmd\/xscroll.js/ }, (args) => ({ path: "vux___vux-xscroll_build_cmd_xscroll__js" }));
                // build.onResolve({ filter: /vux-xscroll\/build\/cmd\/plugins\/pulldown/ }, (args) => ({ path: "vux___vux-xscroll_build_cmd_plugins_pulldown" }));
                // build.onResolve({ filter: /vux-xscroll\/build\/cmd\/plugins\/pullup/ }, (args) => ({ path: "vux___vux-xscroll_build_cmd_plugins_pullup" }));

                // TODO: 思路是对的，当时缺少转化器
                // build.onLoad({ filter: /vux-xscroll\/build\/cmd\/(xscroll\.js|plugins\/(pulldown|pullup))(\\?.*)?/ }, (args) => {                  
                //   const text = fs.readFileSync(args.path, "utf8");
                  
                //   const contents = transform(text, { 
                //     sourceType: "module", 
                //     plugins: [transformModulesPlugin]
                //   }).code;

                //   return {
                //     contents: contents,
                //     loader: "js"
                //   }
                // });
                
                build.onLoad({ filter: /node_modules[\\|\/]vux[\\|\/]src[\\|\/]plugins[\\|\/]loading[\\|\/]index.js$/ }, async (args) => {
                  const contents = await fs.readFileSync(args.path, "utf-8");

                  return {
                    contents: contents.replace(
                      "import LoadingComponent from '../../components/loading'",
                      "import LoadingComponent from '../../components/loading/index.vue'"
                    )
                  }
                });
                build.onLoad({ filter: /node_modules[\\|\/]vux[\\|\/]src[\\|\/]plugins[\\|\/]confirm[\\|\/]index.js$/ }, async (args) => {
                  const contents = await fs.readFileSync(args.path, "utf-8");
                  return {
                    contents: contents.replace(
                      "import ConfirmComponent from '../../components/confirm'",
                      "import ConfirmComponent from '../../components/confirm/index.vue'"
                    )
                  }
                });
                build.onLoad({ filter: /node_modules[\\|\/]vux[\\|\/]src[\\|\/]plugins[\\|\/]alert[\\|\/]util.js$/ }, async (args) => {
                  const contents = await fs.readFileSync(args.path, "utf-8");
                  return {
                    contents: contents.replace(
                    "import AlertComponent from '../../components/alert'",
                    "import AlertComponent from '../../components/alert/index.vue'"
                    )
                  }
                });
                build.onLoad({ filter: /node_modules[\\|\/]vux[\\|\/]src[\\|\/]plugins[\\|\/]toast[\\|\/]index.js$/ }, async (args) => {
                  const contents = await fs.readFileSync(args.path, "utf-8");
                  return {
                    contents: contents.replace(
                      "import ToastComponent from '../../components/toast'",
                      "import ToastComponent from '../../components/toast/index.vue'"
                    )
                  }
                });
              }
            }]
          }
        }
      }
    },
    transform(code, id) {
      const { filename, query } = parseRequest(id);

      if(vueFilter(filename) && !query.vue) {
        const { template, script, styles, customBlocks } = compileVue(id, code);
        return generateVue(
          transformTemplate(template, [templateAtrrsTransformPlugin, ssrTransformPlugin, xiconTransformPlugin, i18nTransformPluginFor$t]),
          transformScript(script),
          transformStyles(styles, [styleTransformPlugin]),
          transformCustomBlocks(customBlocks, [i18nTransformPluginForCustomBlock])
        );
      }
    }
  }, {
    name: "vite-plugin-vux",
    transform(code, id) {
      const { filename, query } = parseRequest(id);

      // TODO: 可优化
      if(path.posix.normalize(id).includes("scroller/index.vue")) {
        const normalizedDir = __dirname.replace(/\\/g, "/");
        const xscrollPath = path.posix.join(
          normalizedDir,
          'libs',
          'xscroll-bundle.js'
        )
        return code
          .replace("import XScroll from 'vux-xscroll/build/cmd/xscroll.js'", `import { XScroll } from "${xscrollPath}"`)
          .replace("import Pulldown from 'vux-xscroll/build/cmd/plugins/pulldown'", `import { Pulldown } from "${xscrollPath}"`)
          .replace("import Pullup from 'vux-xscroll/build/cmd/plugins/pullup'", `import { Pullup } from "${xscrollPath}"`);
      }

      // TODO: 可优化
      if (path.posix.normalize(id).includes("node_modules/vux/src/components/x-number/index.vue")) {
        return code.replace(
          "const Big = require('big.js')",
          "import Big from 'big.js'"
        );
      } else if (path.posix.normalize(id).includes("node_modules/vux/src/components/picker/scroller.js")) {
        return code
          .replace(
            "const Animate = require('./animate')",
            "import Animate from './animate'"
          )
          .replace(
            "const { getElement, getComputedStyle, easeOutCubic, easeInOutCubic } = require('./util')",
            "import { getElement, getComputedStyle, easeOutCubic, easeInOutCubic } from './util'"
          )
          .replace(
            "const passiveSupported = require('../../libs/passive_supported')",
            "import passiveSupported from '../../libs/passive_supported'"
          );
      } else if (path.posix.normalize(id).includes("vux/src/components/popup/popup.js")) {
        return code.replace(
          "const passiveSupported = require('../../libs/passive_supported')",
          "import passiveSupported from '../../libs/passive_supported'"
        );
      } else if (path.posix.normalize(id).includes("node_modules\/vux\/src\/directives\/transfer-dom\/index.js")) {
        return code.replace(
          "const objectAssign = require('object-assign')",
          "import objectAssign from 'object-assign'"
        );
      } else if (path.posix.normalize(id).includes("node_modules/vux/src/components/range/powerange.js")) {
        return code
          .replace(
            "const { findClosest, getWidth, percentage } = require('./utils')",
            "import { findClosest, getWidth, percentage } from './utils'"
          )
          .replace(
            "const classes = require('./lib/classes')",
            "import classes from './lib/classes'"
          )
          .replace(
            "const mouse = require('./lib/mouse')",
            "import mouse from './lib/mouse'"
          )
          .replace(
            "const events = require('./lib/events')",
            "import events from './lib/events'"
          );
      }

      if (
        path.posix.normalize(id).includes("vux/src/libs/passive_supported.js") ||
        path.posix.normalize(id).includes("node_modules/vux/src/components/picker/animate.js") ||
        path.posix.normalize(id).includes("node_modules/vux/src/components/range/lib/classes.js") ||
        path.posix.normalize(id).includes("node_modules/vux/src/components/range/lib/events.js") ||
        path.posix.normalize(id).includes("node_modules/vux/src/components/range/lib/event.js") ||
        path.posix.normalize(id).includes("node_modules/vux/src/components/range/lib/delegate.js") ||
        path.posix.normalize(id).includes("node_modules/vux/src/components/range/lib/closest.js") ||
        path.posix.normalize(id).includes("node_modules/vux/src/components/range/lib/matches-selector.js") ||
        path.posix.normalize(id).includes("node_modules/vux/src/components/range/lib/query.js") ||
        path.posix.normalize(id).includes("node_modules/vux/src/components/range/lib/closest.js") ||
        path.posix.normalize(id).includes("node_modules/vux/src/components/range/lib/emitter.js") ||
        path.posix.normalize(id).includes("node_modules/vux/src/components/range/lib/mouse.js")
       ) {
        if (path.posix.normalize(id).includes("node_modules/vux/src/components/range/lib/classes.js")) {
          return translateCjsToEsm(code)
            .code
            .replace("_utils.indexof", "indexof")
            .replace("import _utils", "import { indexof }");
        }
    
        return translateCjsToEsm(code).code;
      }

      if(!inNodeModules(id)) {
        return parse(
          code,
          (options) => {
            let str = "";
            options.components.forEach(function (component) {
              let file = `vux/${componentMap[component.originalName]}`;
              str += `import ${component.newName} from '${file}'\n`;
            });
            return str;
          },
          "vux"
        );
      }
    }
  }];
}

import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import generator from "@babel/generator";
import { transform } from "@babel/core";
import transformModulesPlugin from "babel-plugin-transform-commonjs";

export function translateCjsToEsm(text: string) {
  const options = {};

  let ast;
  try {
    return transform(text, {
      sourceType: "module",
      plugins: [transformModulesPlugin]
    });
  } catch (err) {
    ast = parser.parse(text, { sourceType: "module" });
    traverse(ast, options);

    return generator(ast);
  }
}

export function parse(source, fn, moduleName) {
  // fix no space between import and {
  // ref https://github.com/airyland/vux/issues/1365
  source = source.replace(/import{/g, "import {");
  source = source.replace(/\/\/\n/g, "");
  source = trimLine(source);

  moduleName = moduleName || "vux";
  if (
    (moduleName && source.indexOf(moduleName) === -1) ||
    source.indexOf("import") === -1
  ) {
    return source;
  }
  const reg = getReg(moduleName);

  let replaceList = [];
  removeComments(removeCommentLine(source)).replace(
    reg,
    function (match1, match2, match3) {
      // dirty way for the moment
      if (match1.indexOf("import") !== match1.lastIndexOf("import")) {
        match1 = match1.slice(match1.lastIndexOf("import"), match1.length);
      }

      const components = getNames(match1);

      if (fn) {
        const replaceString = fn({
          components: components,
          match1: match1,
          match2: match2,
          match3: match3,
          source: source,
        });
        // @ts-ignore
        replaceList.push([match1, replaceString]);
      }
    }
  );
  source = removeCommentLine(source);
  replaceList.forEach(function (one) {
    source = source.replace(one[0], one[1]);
  });
  return source;
}

function removeCommentLine(source) {
  const rs = source
    .split("\n")
    .map(function (line) {
      line = line.replace(/^\s+|\s+$/g, "");
      try {
        line = stripComments.line(line);
      } catch (e) {}
      return line;
    })
    .join("\n");
  return rs;
}

function trimLine(str) {
  let isImport = false;
  let list = str.split("\n");
  for (let i = 0; i < list.length; i++) {
    let currentLine = trim(list[i]);
    if (
      /import/.test(currentLine) &&
      !/from\s+('|")vux('|")/.test(currentLine)
    ) {
      isImport = true;
    } else if (/from\s+('|")(.+)('|")/.test(currentLine)) {
      if (isImport) {
        isImport = false;
      }
    } else {
      if (isImport) {
        list[i] = trim(list[i]);
      }
    }
  }
  return list.join("\n");
}

function trim(str) {
  return str.replace(/^\s+/, "").replace(/\s+$/, "");
}

function getReg(moduleName) {
  return new RegExp(
    `import\\s.*(\\n(?!import).*)*from(\\s)+('|")${moduleName}('|");*`,
    "g"
  );
}

function getNames(one) {
  const startIndex = one.indexOf("{");
  const endIndex = one.indexOf("}");
  const content = one.slice(startIndex + 1, endIndex);
  const list = content
    .split(",")
    .map((one) => {
      return one.replace(/^\s+|\s+$/g, "").replace(/\n/g, "");
    })
    .filter((one) => {
      return !!one;
    })
    .map((one) => {
      if (!/\s+/.test(one)) {
        return {
          originalName: one,
          newName: one,
        };
      } else if (/\s+as/.test(one)) {
        let _list = one.split("as").map(function (one) {
          return one.replace(/^\s+|\s+$/g, "");
        });
        return {
          originalName: _list[0],
          newName: _list[1],
        };
      }

      return one;
    });
  return list;
}

function removeComments(str) {
  str = ("__" + str + "__").split("");
  var mode = {
    singleQuote: false,
    doubleQuote: false,
    regex: false,
    blockComment: false,
    lineComment: false,
    condComp: false,
  };
  for (var i = 0, l = str.length; i < l; i++) {
    if (mode.regex) {
      if (str[i] === "/" && str[i - 1] !== "'") {
        mode.regex = false;
      }
      continue;
    }

    if (mode.singleQuote) {
      if (str[i] === "'" && str[i - 1] !== "'") {
        mode.singleQuote = false;
      }
      continue;
    }

    if (mode.doubleQuote) {
      if (str[i] === '"' && str[i - 1] !== "'") {
        mode.doubleQuote = false;
      }
      continue;
    }

    if (mode.blockComment) {
      if (str[i] === "*" && str[i + 1] === "/") {
        str[i + 1] = "";
        mode.blockComment = false;
      }
      str[i] = "";
      continue;
    }

    if (mode.lineComment) {
      if (str[i + 1] === "n" || str[i + 1] === "r") {
        mode.lineComment = false;
      }
      str[i] = "";
      continue;
    }

    if (mode.condComp) {
      if (str[i - 2] === "@" && str[i - 1] === "*" && str[i] === "/") {
        mode.condComp = false;
      }
      continue;
    }

    mode.doubleQuote = str[i] === '"';
    mode.singleQuote = str[i] === "'";

    if (str[i] === "/") {
      if (str[i + 1] === "*" && str[i + 2] === "@") {
        mode.condComp = true;
        continue;
      }
      if (str[i + 1] === "*") {
        str[i] = "";
        mode.blockComment = true;
        continue;
      }
      if (str[i + 1] === "/") {
        str[i] = "";
        mode.lineComment = true;
        continue;
      }
      mode.regex = true;
    }
  }
  const rs = str.join("").slice(2, -2);
  return rs;
}