import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "playground/**",
      "coverage/**",
      // Vendored, minified third-party build output.
      "src/libs/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The plugin runs inside Node, inside Vite.
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // `no-explicit-any` is too strict for the Vite/Rollup hook signatures we
      // have to duck-type against; keep it a warning so new code still sees it.
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "smart"],
      "object-shorthand": "error",
      "prefer-const": "error",
    },
  },
  {
    files: ["test/**/*.ts"],
    rules: {
      // Tests assert against half-typed plugin internals on purpose.
      "@typescript-eslint/no-explicit-any": "off",
    },
  }
);
