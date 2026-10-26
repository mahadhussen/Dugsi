import { defineConfig } from "vitest/config";
import os from "node:os";
import path from "node:path";

// Every test run uses a brand-new, empty SQLite file in the OS temp dir, so
// tests never touch (or reset) the development database.
const testDb = process.env.TEST_DATABASE_URL ?? `file:${path.join(os.tmpdir(), `assessment-trainer-test-${process.pid}-${Date.now()}.db`)}`;
process.env.TEST_DATABASE_URL = testDb;

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    globalSetup: ["tests/global-setup.ts"],
    env: {
      DATABASE_URL: testDb,
      UPLOAD_DIR: path.join(os.tmpdir(), "assessment-trainer-test-uploads"),
      VISION_PROVIDER: "local",
      TEXT_PROVIDER: "local",
      REASONING_PROVIDER: "local",
    },
  },
});
