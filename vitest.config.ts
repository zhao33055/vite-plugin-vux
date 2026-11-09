import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // The specs read `test/fixtures/vux-mini` instead of the installed package,
    // so nothing here depends on a partially installed tree; forks keeps each
    // file's `console.warn` spies and dependency-read caches to itself.
    pool: "forks",
  },
});
