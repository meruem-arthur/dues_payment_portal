import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    // Default (5000ms) is tight for the first test in a file that imports a
    // Next.js route module for the first time - route compilation cost lands
    // on whichever test runs first, and can vary a lot by machine. Route
    // handler imports were moved to the top of test files to pay that cost
    // during collection rather than inside a test body (see
    // src/app/api/_authorization-boundary.test.ts), but this stays as a
    // defensive floor for slower machines/cold caches.
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
