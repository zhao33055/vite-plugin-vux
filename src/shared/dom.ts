/** Matches `<name ...>...</name>` including nested content. */
export function createTagRegex(name: string): RegExp {
  return new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "g");
}

/** Drops the tag and everything inside it. */
export function removeTag(code: string, tag: string): string {
  return code.replace(createTagRegex(tag), "");
}

/** Keeps the tag's content and drops the tag itself. */
export function reserveTag(code: string, tag: string): string {
  return code.replace(createTagRegex(tag), (_match, text: string) => text);
}
