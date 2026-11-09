import { transformSync, type PluginObj } from "@babel/core";
import * as t from "@babel/types";

export interface LiftedRequires {
  code: string;
  /**
   * `require()` calls left in the output (inside functions, conditionals, ...).
   * Callers should surface these: nothing else will convert them, so a
   * build-time warning beats a runtime `require is not defined`.
   */
  remainingRequires: number;
}

/**
 * Rough but safe test for ESM syntax. Its only job is to tell the two source
 * shapes apart, and a false negative merely means the file is left alone.
 */
const ESM_SYNTAX_RE = /(^|\n)\s*(import|export)[\s{*'"(]/;

function isRequireCall(node: t.Node | null | undefined): node is t.CallExpression {
  return (
    !!node &&
    t.isCallExpression(node) &&
    t.isIdentifier(node.callee, { name: "require" }) &&
    node.arguments.length === 1 &&
    t.isStringLiteral(node.arguments[0])
  );
}

/**
 * Lifts top-level `require()` declarations into imports.
 *
 * ```js
 * const Animate = require('./animate')              // -> import Animate from './animate'
 * const { el } = require('./util')                   // -> import { el } from './util'
 * ```
 */
function createRequireHoistPlugin(state: { changed: boolean }): PluginObj {
  return {
    visitor: {
      Program(path) {
        const hoisted: t.ImportDeclaration[] = [];

        for (const statement of path.get("body")) {
          if (!statement.isVariableDeclaration()) continue;

          const kept: t.VariableDeclarator[] = [];

          for (const declarator of statement.get("declarations")) {
            const call = declarator.node.init;
            if (!isRequireCall(call)) {
              kept.push(declarator.node);
              continue;
            }

            state.changed = true;
            const source = t.cloneNode(call.arguments[0] as t.StringLiteral);

            if (t.isIdentifier(declarator.node.id)) {
              hoisted.push(
                t.importDeclaration(
                  [t.importDefaultSpecifier(t.identifier(declarator.node.id.name))],
                  source
                )
              );
              continue;
            }

            if (t.isObjectPattern(declarator.node.id)) {
              const specifiers = declarator.node.id.properties.flatMap((property) => {
                if (
                  !t.isObjectProperty(property) ||
                  !t.isIdentifier(property.value) ||
                  !t.isIdentifier(property.key)
                ) {
                  return [];
                }
                return [
                  t.importSpecifier(
                    t.identifier(property.value.name),
                    t.identifier(property.key.name)
                  ),
                ];
              });

              if (specifiers.length) {
                hoisted.push(t.importDeclaration(specifiers, source));
                continue;
              }
            }

            kept.push(declarator.node);
          }

          if (kept.length === statement.node.declarations.length) continue;

          if (kept.length) {
            statement.replaceWith(t.variableDeclaration(statement.node.kind, kept));
          } else {
            statement.remove();
          }
        }

        if (hoisted.length) path.unshiftContainer("body", hoisted);
      },
    },
  };
}

function countRequires(code: string): number {
  return (code.match(/\brequire\(/g) ?? []).length;
}

/**
 * Converts the `require()` leftovers in a **mixed** module - one that already
 * uses `import`/`export` - into imports.
 *
 * Pure CommonJS files are deliberately returned as `null`: Vite already
 * converts those itself (esbuild while pre-bundling, `@rollup/plugin-commonjs`
 * while building), and converting them here would fight that pass and produce
 * duplicate declarations. Mixed files are the case nothing else handles,
 * because both converters skip any file that contains ESM syntax. vux 2.9.x is
 * full of them: `scroller.js`, `popup/popup.js`, `range/powerange.js`,
 * `directives/transfer-dom`.
 */
export function liftRequireImports(
  code: string,
  filename: string
): LiftedRequires | null {
  if (!ESM_SYNTAX_RE.test(code)) return null;

  const state = { changed: false };

  try {
    const result = transformSync(code, {
      babelrc: false,
      configFile: false,
      sourceType: "module",
      filename,
      compact: false,
      retainLines: true,
      plugins: [createRequireHoistPlugin(state)],
    });

    if (!result?.code || result.code === code) return null;

    return { code: result.code, remainingRequires: countRequires(result.code) };
  } catch {
    // An unparseable file is not ours to report: let Vite's own error surface.
    return null;
  }
}
