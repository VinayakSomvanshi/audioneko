import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "cloudflare:workers": path.resolve(__dirname, "./src/test-utils/cloudflare-workers-mock.ts"),
    },
  },
  test: {
    environment: "node",
  },
});
