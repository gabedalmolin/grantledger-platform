import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: [
      "apps/api/src/**/*.test.ts",
      "apps/worker/src/**/*.test.ts",
      "packages/application/src/**/*.test.ts",
      "packages/contracts/src/**/*.test.ts",
      "packages/domain/src/**/*.test.ts",
      "packages/infra-postgres/src/**/*.test.ts",
      "packages/shared/src/**/*.test.ts",
    ],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: [
        "**/*.test.ts",
        "**/*.d.ts",
        "**/index.ts",
        "docs/**",
        "scripts/**",
      ],
      thresholds: {
        statements: 55,
        branches: 45,
        functions: 50,
        lines: 55,
      },
    },
  },
});
