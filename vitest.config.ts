import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Sama dengan transform Next.js: JSX memakai automatic runtime, sehingga
  // file `.tsx` tidak perlu mengimpor React hanya agar lolos di Vitest.
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    setupFiles: ["./tests/setup.ts"],
    passWithNoTests: true,
  },
});
