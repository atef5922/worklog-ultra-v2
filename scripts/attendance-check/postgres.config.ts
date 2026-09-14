import path from "node:path";
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "../../src") } },
  test: { environment: "node", include: ["scripts/attendance-check/postgres.test.ts"], testTimeout: 15000, hookTimeout: 15000 },
});
