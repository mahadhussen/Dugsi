import { execSync } from "node:child_process";

/** Create the schema in the fresh, empty test database (see vitest.config.ts). */
export default function setup() {
  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
    stdio: "pipe",
  });
}
