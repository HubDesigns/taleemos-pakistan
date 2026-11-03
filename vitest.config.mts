import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    setupFiles: ["tests/setup-db.ts"],
    testTimeout: 30000,
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
});
