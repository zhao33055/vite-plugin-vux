import type { Logger } from "../../src/shared/logger";

/**
 * A `Logger` that keeps what it was told.
 *
 * This is the reason the plugin takes a sink at all: a warning used to be
 * assertable only by replacing `console.warn` globally, which made the test
 * depend on how the message happened to be written rather than on whether the
 * build said it.
 */
export function createRecorder(): Logger & { readonly messages: readonly string[] } {
  const messages: string[] = [];

  return {
    messages,
    warn: (message) => {
      messages.push(message);
    },
  };
}
