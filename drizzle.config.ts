import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://civil:civil_dev_pw_2026@localhost:5433/civil_erp",
  },
  strict: true,
  verbose: true,
});
