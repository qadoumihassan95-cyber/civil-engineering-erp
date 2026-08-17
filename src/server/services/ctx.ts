import { getDb, type Db } from "@/db";
import type { AuthUser } from "@/server/auth/context";

export interface Ctx {
  db: Db;
  actor: AuthUser;
}

export function makeCtx(actor: AuthUser, db: Db = getDb().db): Ctx {
  return { db, actor };
}

export async function inTx<T>(ctx: Ctx, fn: (db: Db) => Promise<T>): Promise<T> {
  return ctx.db.transaction(async (tx) => fn(tx as unknown as Db)) as Promise<T>;
}

export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
}

export async function withNumberRetry<T>(ctx: Ctx, fn: (db: Db) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await inTx(ctx, (db) => fn(db));
    } catch (e) {
      lastError = e;
      if (!isUniqueViolation(e)) throw e;
    }
  }
  throw lastError;
}
