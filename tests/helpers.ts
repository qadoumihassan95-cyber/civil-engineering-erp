import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { createDb, setDbForTests, type Db } from "@/db";
import { users, projects, projectMembers, type UserRole } from "@/db/schema";
import { hashPassword } from "@/server/auth/password";
import { newId } from "@/server/lib/ids";
import { makeCtx, type Ctx } from "@/server/services/ctx";
import type { AuthUser } from "@/server/auth/context";

export const TEST_URL = process.env.TEST_DATABASE_URL ?? "postgres://civil:civil_dev_pw_2026@localhost:5433/civil_erp_test";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://civil:civil_dev_pw_2026@localhost:5433/civil_erp_test";
}

const TABLES = [
  "audit_logs", "dr_events", "dr_visitors", "dr_safety", "dr_incidents", "dr_delays",
  "dr_material_consumed", "dr_material_received", "dr_activities", "dr_equipment",
  "dr_subcontractors", "dr_manpower", "daily_reports",
  "wir_events", "entity_files", "wir",
  "stock_transactions", "return_items", "supplier_returns",
  "transfer_items", "transfers", "issue_items", "issues",
  "receipt_items", "receipts", "adjustment_items", "adjustments",
  "documents", "files", "expenses", "expense_categories",
  "materials", "material_categories", "suppliers", "warehouses",
  "project_members", "boq_items", "boq_sections", "projects",
  "sessions", "users",
];

let setupPromise: Promise<{ db: Db }> | null = null;

export async function setupTestDb(): Promise<Db> {
  if (!setupPromise) {
    setupPromise = (async () => {
      const { db, client } = createDb(TEST_URL, { max: 5 });
      setDbForTests({ db, client });
      await migrate(db, { migrationsFolder: "./drizzle" });
      for (const t of TABLES) {
        await db.execute(sql.raw(`truncate table ${t} restart identity cascade`));
      }
      return { db };
    })();
  }
  return (await setupPromise).db;
}

let sharedHash: string | null = null;

async function testPasswordHash(): Promise<string> {
  if (!sharedHash) sharedHash = await hashPassword("TestPass123!");
  return sharedHash;
}

export async function mkUser(
  db: Db,
  role: UserRole,
  name = `User ${role}`,
): Promise<AuthUser> {
  const id = newId();
  await db.insert(users).values({
    id,
    email: `${role}.${id.slice(0, 8)}@test.local`,
    name,
    role,
    password_hash: await testPasswordHash(),
    is_active: true,
    locale: "en",
  });
  return { id, email: `u@${id}.local`, name, role, locale: "en", phone: null };
}

export async function mkProject(
  db: Db,
  opts: { code?: string; managerId?: string; memberIds?: string[]; settings?: Record<string, unknown> } = {},
): Promise<string> {
  const id = newId();
  await db.insert(projects).values({
    id,
    code: opts.code ?? `PRJ-${id.slice(0, 4)}`,
    name: "Test Project",
    contract_value: "1000000.000",
    start_date: "2025-01-01",
    planned_end_date: "2026-01-01",
    status: "active",
    manager_id: opts.managerId ?? null,
    settings: (opts.settings ?? {}) as never,
  });
  const ids = [...new Set([...(opts.memberIds ?? []), ...(opts.managerId ? [opts.managerId] : [])])];
  if (ids.length) {
    await db.insert(projectMembers).values(ids.map((userId) => ({ project_id: id, user_id: userId })));
  }
  return id;
}

export async function mkBoqItem(
  db: Db,
  projectId: string,
  opts: { code?: string; qty?: string; rate?: string; unit?: string } = {},
) {
  const { boqItems } = await import("@/db/schema");
  const id = newId();
  await db.insert(boqItems).values({
    id,
    project_id: projectId,
    code: opts.code ?? "IT-1",
    description: "Test item",
    unit: opts.unit ?? "m3",
    contract_qty: opts.qty ?? "1000.0000",
    unit_rate: opts.rate ?? "100.000",
    contract_amount: String(Math.round((parseFloat(opts.qty ?? "1000") * parseFloat(opts.rate ?? "100")) * 1000) / 1000) + "",

    sort: 0,
  });
  return { id, unit: opts.unit ?? "m3" };
}

export function ctxFor(db: Db, actor: AuthUser): Ctx {
  return makeCtx(actor, db);
}

export async function expectError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (e) {
    return e;
  }
  throw new Error("Expected function to throw");
}

export function errorCode(e: unknown): string | undefined {
  if (e && typeof e === "object" && (e as { name?: string }).name === "ZodError") {
    return "VALIDATION";
  }
  return (e as { code?: string })?.code;
}
