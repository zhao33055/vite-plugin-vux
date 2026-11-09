import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Tests read the real installed vux package as a fixture, so they must not
    // run against a partially installed tree.
    pool: "forks",
  },
});
