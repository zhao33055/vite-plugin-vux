/**
 * `strip-css-comments` v3 still ships CommonJS without type declarations and
 * has no `@types` package.
 */
declare module "strip-css-comments" {
  interface Options {
    /** Keep `/*!`-prefixed "important" comments. */
    preserve?: boolean;
    /** Match the original line breaks. */
    trim?: boolean;
  }

  export default function stripCssComments(css: string, options?: Options): string;
}
