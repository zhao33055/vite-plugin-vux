import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // The specs read `test/fixtures/vux-mini` instead of the installed package,
    // so nothing here depends on a partially installed tree. Forks keeps the
    // module-level caches - the file-read cache, the warned-name sets - from
    // leaking between files. Diagnostics need no isolating any more: a spec
    // hands its own `Logger` to the code under test.
    pool: "forks",
  },
});
