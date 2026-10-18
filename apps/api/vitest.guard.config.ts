import { defineConfig } from "vitest/config";

// Deliberately no integration setup: only pure guards, mocks and simulated transports.
export default defineConfig({
  test: { include: ["src/testing/**/*.test.ts"], setupFiles: ["./vitest.guard.setup.ts"], fileParallelism: false },
});
