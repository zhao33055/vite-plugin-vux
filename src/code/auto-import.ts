import { transformSync, type PluginObj } from "@babel/core";
import * as t from "@babel/types";
import type { SourceMap } from "rollup";

/** Any member of an `import` clause's specifier list. */
type ImportClause = t.ImportDeclaration["specifiers"][number];

export interface TransformResult {
  code: string;
  map?: SourceMap;
}

/** Cheap guard so babel never runs on files that cannot contain a vux import. */
const VUX_IMPORT_RE = /\bfrom\s*["']vux["']/;

function createVuxImportPlugin(
  componentMap: Record<string, string>,
  onUnknown: (name: string) => void,
  markChanged: () => void
): PluginObj {
  // Babel re-visits nodes produced by `replaceWithMultiple`, so a single
  // import is visited twice; report each name only once.
  const reported = new Set<string>();
  const reportUnknown = (name: string) => {
    if (reported.has(name)) return;
    reported.add(name);
    onUnknown(name);
  };

  return {
    visitor: {
      ImportDeclaration(path) {
        if (path.node.source.value !== "vux") return;

        const known: t.ImportSpecifier[] = [];
        const kept: ImportClause[] = [];

        for (const specifier of path.node.specifiers) {
          // Default / namespace imports (`import vux from "vux"`) are left alone.
          if (!t.isImportSpecifier(specifier)) {
            kept.push(specifier);
            continue;
          }

          const importedName = t.isIdentifier(specifier.imported)
            ? specifier.imported.name
            : specifier.imported.value;

          if (componentMap[importedName]) {
            known.push(specifier);
          } else {
            // Unknown names stay in place instead of becoming `vux/undefined`.
            reportUnknown(importedName);
            kept.push(specifier);
          }
        }

        if (!known.length) return;

        const replacements = known.map((specifier) => {
          const importedName = t.isIdentifier(specifier.imported)
            ? specifier.imported.name
            : specifier.imported.value;

          return t.importDeclaration(
            [t.importDefaultSpecifier(t.identifier(specifier.local.name))],
            t.stringLiteral(`vux/${componentMap[importedName]}`)
          );
        });

        markChanged();

        if (kept.length) {
          path.replaceWithMultiple([
            ...replacements,
            t.importDeclaration(kept, t.stringLiteral("vux")),
          ]);
        } else {
          path.replaceWithMultiple(replacements);
        }
      },
    },
  };
}

/**
 * Rewrites `import { XButton, XInput } from "vux"` into one default import per
 * component, resolved through vux's own `map.json`.
 *
 * Returns `null` when nothing had to change, so callers can skip work and let
 * other plugins keep the original sourcemap chain.
 */
export function transformVuxImport(
  code: string,
  componentMap: Record<string, string>,
  options: {
    filename: string;
    onUnknown?: (name: string) => void;
  }
): TransformResult | null {
  if (!VUX_IMPORT_RE.test(code)) return null;

  // Babel reprints the whole file, so a byte comparison against the input is
  // not enough to tell whether anything actually changed: track the rewrite.
  let changed = false;

  const result = transformSync(code, {
    // Never inherit the app's babel config: this runs on already-compiled code.
    babelrc: false,
    configFile: false,
    sourceType: "module",
    filename: options.filename,
    sourceMaps: true,
    compact: false,
    retainLines: true,
    plugins: [
      createVuxImportPlugin(componentMap, options.onUnknown ?? (() => {}), () => {
        changed = true;
      }),
    ],
  });

  if (!changed || !result?.code) return null;

  return { code: result.code, map: result.map as SourceMap | undefined };
}
