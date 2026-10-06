import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Security policy tests use node:test and run through test:security.
    exclude: [...configDefaults.exclude, "scripts/**"],
  },
});
