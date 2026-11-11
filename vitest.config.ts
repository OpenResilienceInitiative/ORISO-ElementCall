import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

export default defineConfig((configEnv) =>
  mergeConfig(
    viteConfig(configEnv),
    defineConfig({
      test: {
        environment: "jsdom",
        css: {
          modules: {
            classNameStrategy: "non-scoped",
          },
        },
        setupFiles: ["src/vitest.setup.ts"],
        server: {
          deps: {
            // Ships ES modules with extensionless imports, which Node cannot
            // load; Vite resolves them. Used by the call's brand palette.
            inline: ["@material/material-color-utilities"],
          },
        },
        include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
        coverage: {
          reporter: ["html", "json"],
          include: ["src/"],
          exclude: [
            "src/**/*.{d,test}.{ts,tsx}",
            "src/utils/test.ts",
            "src/utils/test-viewmodel.ts",
            "src/utils/test-fixtures.ts",
            "playwright/**",
          ],
        },
      },
    }),
  ),
);
