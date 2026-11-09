/**
 * Where a build's diagnostics go.
 *
 * The deep modules used to call `console.warn` themselves, which cost two
 * things: a warning could only be asserted on by replacing a global, and there
 * was no way to send one anywhere else - to a caller embedding the plugin, or to
 * a build that collects messages. One method, one already-composed string.
 *
 * Transform hooks that run with a Rollup plugin context keep using `this.warn`,
 * which routes into Vite's own warning channel; this is for the hooks Vite types
 * with `this: void` (`config`, `configResolved`) and for the modules below them
 * that have no context at all.
 */
export interface Logger {
  warn(message: string): void;
}

/** The tag every message carries when it reaches a bare console. */
export const MESSAGE_PREFIX = "[vite-plugin-vux]";

/**
 * The default sink.
 *
 * Messages reach `Logger` without the prefix - callers must not add it - so
 * this is the only place that knows a console line needs dressing up.
 */
export function createConsoleLogger(prefix: string = MESSAGE_PREFIX): Logger {
  return {
    warn: (message) => console.warn(`${prefix} ${message}`),
  };
}
