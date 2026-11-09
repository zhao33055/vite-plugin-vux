import { getStylesDir, getThemeVariables } from "./api";
import type { VuxPlugin } from "../types";

/**
 * The `css` portion of the Vite config this plugin contributes.
 *
 * `paths` points at vux's less variables so vux's own components can `@import`
 * them, and `modifyVars` injects the app's theme overrides into every less
 * compilation - including the ones inside vux's components.
 */
export function lessConfig(
  root: string,
  plugins: VuxPlugin[]
): {
  preprocessorOptions: { less: { paths: string[]; modifyVars: Record<string, string> } };
} {
  return {
    preprocessorOptions: {
      less: {
        paths: [getStylesDir(root)],
        modifyVars: getThemeVariables(root, plugins),
      },
    },
  };
}
