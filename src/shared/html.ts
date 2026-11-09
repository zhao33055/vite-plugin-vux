/**
 * The single entry point for rewriting markup.
 *
 * Two transforms need it (`i18n` and `x-icon`), and both face the same trap: the
 * text they emit has to survive the *place* it is emitted into. A translation
 * inside `{{ }}` wants `"确定"`; the same string inside
 * `:data-confirm-text="…"` wants `'确定'`, because a double quote there closes the
 * attribute, the template parser reports "text outside root element" and drops
 * the tag. With the context handled in one place, that is one bug instead of one
 * per transform.
 */

export interface ExpressionContext {
  /** Quote of the HTML attribute value the match sits inside, if any. */
  readonly quote?: '"' | "'";
}

export interface TemplatePatch {
  /**
   * Pattern to replace; capture groups are handed to `replace` in order.
   * Named groups are not supported - `String#replace` appends them after the
   * offset, which is where this module reads the offset from.
   */
  readonly pattern: RegExp;
  /**
   * Text to put in place of one match. Returning `match` unchanged leaves that
   * occurrence alone, which is how a transform declines a call it cannot
   * resolve at build time (a missing locale, a bound `:type`).
   */
  readonly replace: (
    match: string,
    groups: readonly (string | undefined)[],
    context: ExpressionContext
  ) => string;
}

export function patchTemplate(source: string, patches: readonly TemplatePatch[]): string {
  let output = source;

  for (const { pattern, replace } of patches) {
    // Clone per call: a shared `/g` regex carries `lastIndex` from one file to
    // the next, which would make replacements depend on processing order.
    const matcher = new RegExp(
      pattern.source,
      pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`
    );
    // Offsets handed to `replace` are relative to this string, not to `output`
    // after the patch - keep the subject for context lookups.
    const subject = output;

    output = output.replace(matcher, (match: string, ...rest: unknown[]) => {
      const groups = rest.slice(0, -2) as (string | undefined)[];
      const offset = rest[rest.length - 2] as number;

      return replace(match, groups, {
        quote: openAttributeQuote(subject.slice(0, offset)),
      });
    });
  }

  return output;
}

/** A JavaScript literal for `value` that is valid where it is being written. */
export function literalFor(value: string, context: ExpressionContext): string {
  if (!context.quote) return JSON.stringify(value);

  return quoteJsString(value, context.quote === '"' ? "'" : '"');
}

/** The quote character of the attribute value `text` is currently inside. */
function openAttributeQuote(text: string): '"' | "'" | undefined {
  const tagStart = text.lastIndexOf("<");
  if (tagStart === -1 || text.lastIndexOf(">") > tagStart) return undefined;

  let open: '"' | "'" | undefined;
  for (let i = tagStart + 1; i < text.length; i++) {
    const char = text[i];
    if (open) {
      if (char === open) open = undefined;
    } else if (char === '"' || char === "'") {
      open = char;
    }
  }

  return open;
}

function quoteJsString(value: string, quote: '"' | "'"): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(new RegExp(quote, "g"), `\\${quote}`);

  return `${quote}${escaped}${quote}`;
}
