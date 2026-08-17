import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDb(url: string, opts: { max?: number; prepare?: boolean } = {}) {
  const client = postgres(url, {
    max: opts.max ?? 10,
    prepare: opts.prepare ?? true,
  });
  return { client, db: drizzle(client, { schema }) };
}

const globalForDb = globalThis as unknown as {
  __civilErpDb?: ReturnType<typeof createDb>;
};

export function getDb() {
  if (globalForDb.__civilErpDb) {
    return globalForDb.__civilErpDb;
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  globalForDb.__civilErpDb = createDb(process.env.DATABASE_URL);
  return globalForDb.__civilErpDb;
}

/** Used by the test suite to point the shared db handle at the test database. */
export function setDbForTests(db: ReturnType<typeof createDb>): void {
  globalForDb.__civilErpDb = db;
}

export type Db = ReturnType<typeof createDb>["db"];
export type SqlClient = ReturnType<typeof createDb>["client"];
export { schema };
