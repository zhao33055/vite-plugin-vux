/**
 * Escapes a literal for embedding in a `RegExp` built at runtime.
 *
 * Anything that interpolates user- or option-supplied text into a pattern needs
 * this: an unescaped `$` in a translation function name is a regex anchor, and
 * the pattern then silently matches something else.
 */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
