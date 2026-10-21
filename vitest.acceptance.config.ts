import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/acceptance/**/*.test.ts"],
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 950000,
    reporters: ["verbose"],
  },
});
