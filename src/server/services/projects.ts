import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  projects,
  projectMembers,
  users,
  boqItems,
  wir,
  expenses,
  dailyReports,
} from "@/db/schema";
import type { Ctx } from "./ctx";
import { audit } from "./audit";
import { AppError, notFound, validation } from "@/server/lib/errors";
import { requirePermission, hasProjectAccess } from "@/server/auth/context";
import { d, percent } from "@/server/lib/decimal";
import { newId, nextNumber } from "@/server/lib/ids";

const projectSettingsSchema = z.object({
  dailyReportApproval: z.enum(["manager", "none"]).default("manager"),
  stockAdjustmentPolicy: z.enum(["simple", "controlled"]).default("controlled"),
  allowNegativeStock: z.boolean().default(false),
});

export const createProjectSchema = z.object({
  code: z.string().min(2).max(30).regex(/^[A-Za-z0-9._-]+$/, "Code may contain letters, numbers, dot, dash, underscore"),
  name: z.string().min(2).max(200),
  description: z.string().max(4000).optional(),
  client_name: z.string().max(200).optional(),
  consultant_name: z.string().max(200).optional(),
  contractor_name: z.string().max(200).optional(),
  location: z.string().max(250).optional(),
  currency: z.string().length(3).default("JOD"),
  contract_value: z.string().regex(/^\d+(\.\d{1,3})?$/).default("0"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  planned_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  manager_id: z.string().uuid().nullable().optional(),
  member_ids: z.array(z.string().uuid()).optional(),
  settings: projectSettingsSchema.optional(),
});

export const updateProjectSchema = createProjectSchema
  .partial()
  .omit({ code: true })
  .extend({
    status: z.enum(["planning", "active", "on_hold", "completed", "cancelled"]).optional(),
    actual_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  });

export async function listProjects(ctx: Ctx, opts: { status?: string; search?: string } = {}) {
  const conds = [];
  if (opts.status) conds.push(eq(projects.status, opts.status as never));
  if (opts.search && opts.search.trim()) {
    const s = `%${opts.search.trim()}%`;
    conds.push(
      sql`(${projects.code} ilike ${s} or ${projects.name} ilike ${s} or ${projects.client_name} ilike ${s})`,
    );
  }
  const where = conds.length ? and(...conds) : undefined;
  return ctx.db.select().from(projects).where(where).orderBy(asc(projects.code));
}

export async function listVisibleProjects(ctx: Ctx, opts: { status?: string; search?: string } = {}) {
  const all = await listProjects(ctx, opts);
  const out = [];
  for (const p of all) {
    if (await hasProjectAccess(ctx.actor, p.id)) out.push(p);
  }
  return out;
}

export async function getProject(ctx: Ctx, id: string) {
  const [project] = await ctx.db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) notFound("Project");
  if (!(await hasProjectAccess(ctx.actor, project.id))) {
    throw new AppError("FORBIDDEN", "You do not have access to this project", {
      i18nKey: "errors.forbidden",
    });
  }
  return project;
}

export async function getProjectMembers(ctx: Ctx, projectId: string) {
  return ctx.db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      phone: users.phone,
      is_active: users.is_active,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.user_id))
    .where(eq(projectMembers.project_id, projectId))
    .orderBy(asc(users.name));
}

export async function createProject(ctx: Ctx, input: z.infer<typeof createProjectSchema>) {
  requirePermission(ctx.actor, "project:create");
  const data = createProjectSchema.parse(input);
  const id = newId();
  await ctx.db.transaction(async (tx) => {
    await tx.insert(projects).values({
      id,
      code: data.code.toUpperCase(),
      name: data.name,
      description: data.description ?? null,
      client_name: data.client_name ?? null,
      consultant_name: data.consultant_name ?? null,
      contractor_name: data.contractor_name ?? null,
      location: data.location ?? null,
      currency: data.currency,
      contract_value: data.contract_value,
      start_date: data.start_date ?? null,
      planned_end_date: data.planned_end_date ?? null,
      manager_id: data.manager_id ?? null,
      settings: (data.settings ?? {}) as never,
    });
    const memberIds = new Set<string>(data.member_ids ?? []);
    if (data.manager_id) memberIds.add(data.manager_id);
    if (memberIds.size) {
      await tx.insert(projectMembers).values(
        [...memberIds].map((userId) => ({ project_id: id, user_id: userId })),
      );
    }
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "created",
      entityType: "project",
      entityId: id,
      projectId: id,
      after: { code: data.code, name: data.name },
    });
  });
  return { id };
}

export async function updateProject(
  ctx: Ctx,
  id: string,
  input: z.infer<typeof updateProjectSchema>,
) {
  requirePermission(ctx.actor, "project:update");
  await getProject(ctx, id);
  const data = updateProjectSchema.parse(input);
  const before = await ctx.db.select().from(projects).where(eq(projects.id, id)).limit(1);
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(projects)
      .set({
        name: data.name,
        description: data.description,
        client_name: data.client_name,
        consultant_name: data.consultant_name,
        contractor_name: data.contractor_name,
        location: data.location,
        currency: data.currency,
        contract_value: data.contract_value,
        start_date: data.start_date,
        planned_end_date: data.planned_end_date,
        manager_id: data.manager_id,
        settings: data.settings as never | undefined,
        status: data.status as never | undefined,
        actual_end_date: data.actual_end_date,
        updated_at: new Date().toISOString(),
      })
      .where(eq(projects.id, id));
    if (data.member_ids) {
      await tx.delete(projectMembers).where(eq(projectMembers.project_id, id));
      const ids = new Set(data.member_ids);
      if (data.manager_id) ids.add(data.manager_id);
      if (ids.size) {
        await tx.insert(projectMembers).values(
          [...ids].map((userId) => ({ project_id: id, user_id: userId })),
        );
      }
    }
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "updated",
      entityType: "project",
      entityId: id,
      projectId: id,
      before: pickDiff(before[0], data),
      after: data,
    });
  });
}

function pickDiff(before: unknown, after: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!before || typeof before !== "object") return out;
  for (const [k, v] of Object.entries(after)) {
    const b = (before as Record<string, unknown>)[k];
    if (JSON.stringify(b) !== JSON.stringify(v)) out[k] = b ?? null;
  }
  return out;
}

export async function updateProjectStatus(ctx: Ctx, id: string, status: string) {
  requirePermission(ctx.actor, "project:update");
  const project = await getProject(ctx, id);
  const valid = ["planning", "active", "on_hold", "completed", "cancelled"];
  if (!valid.includes(status)) validation("Invalid project status");
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(projects)
      .set({
        status: status as never,
        actual_end_date:
          status === "completed"
            ? new Date().toISOString().slice(0, 10)
            : project.actual_end_date,
        updated_at: new Date().toISOString(),
      })
      .where(eq(projects.id, id));
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "updated",
      entityType: "project",
      entityId: id,
      projectId: id,
      before: { status: project.status },
      after: { status },
    });
  });
}

export async function setProjectSettings(ctx: Ctx, id: string, settings: z.infer<typeof projectSettingsSchema>) {
  requirePermission(ctx.actor, "project:settings");
  const project = await getProject(ctx, id);
  const data = projectSettingsSchema.parse(settings);
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(projects)
      .set({ settings: data as never, updated_at: new Date().toISOString() })
      .where(eq(projects.id, id));
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "updated",
      entityType: "project",
      entityId: id,
      projectId: id,
      before: { settings: project.settings },
      after: { settings: data },
    });
  });
}

// ---------------------------------------------------------------------------
// Project control computations (single source of truth for progress values)
// ---------------------------------------------------------------------------

export interface BoqProgress {
  contractValue: string;
  executedValue: string;
  submittedValue: string;
  approvedValue: string;
  certifiedValue: string;
  remainingValue: string;
  progressPercent: string;
  executedPercent: string;
  itemCount: number;
}

export async function computeProjectProgress(ctx: Ctx, projectId: string): Promise<BoqProgress> {
  const items = await ctx.db
    .select({
      contract_amount: boqItems.contract_amount,
      unit_rate: boqItems.unit_rate,
      contract_qty: boqItems.contract_qty,
      executed_qty: boqItems.executed_qty,
      certified_qty: boqItems.certified_qty,
      id: boqItems.id,
    })
    .from(boqItems)
    .where(and(eq(boqItems.project_id, projectId), eq(boqItems.is_active, true)));

  const submittedRows = await ctx.db
    .select({ item: wir.boq_item_id, qty: wir.submitted_qty })
    .from(wir)
    .where(
      and(
        eq(wir.project_id, projectId),
        sql`${wir.status} in ('submitted','under_review')`,
      ),
    );

  const approvedRows = await ctx.db
    .select({ item: wir.boq_item_id, qty: sql<string>`coalesce(${wir.approved_qty}, ${wir.submitted_qty})` })
    .from(wir)
    .where(
      and(
        eq(wir.project_id, projectId),
        sql`${wir.status} in ('approved','approved_with_comments')`,
      ),
    );

  const sumBy = (rows: { item: string; qty: string | null }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const v = parseFloat(r.qty ?? "0") || 0;
      m.set(r.item, (m.get(r.item) ?? 0) + v);
    }
    return m;
  };
  const submittedByItem = sumBy(submittedRows as never);
  const approvedByItem = sumBy(approvedRows as never);

  let contractValue = d(0);
  let executedValue = d(0);
  let submittedValue = d(0);
  let approvedValue = d(0);
  let certifiedValue = d(0);

  for (const item of items) {
    const rate = d(item.unit_rate);
    const contractAmount = d(item.contract_amount);
    contractValue = contractValue.plus(contractAmount);
    executedValue = executedValue.plus(d(item.executed_qty).times(rate));
    submittedValue = submittedValue.plus(d(submittedByItem.get(item.id) ?? 0).times(rate));
    approvedValue = approvedValue.plus(d(approvedByItem.get(item.id) ?? 0).times(rate));
    certifiedValue = certifiedValue.plus(d(item.certified_qty ?? 0).times(rate));
  }

  return {
    contractValue: contractValue.toFixed(3),
    executedValue: executedValue.toFixed(3),
    submittedValue: submittedValue.toFixed(3),
    approvedValue: approvedValue.toFixed(3),
    certifiedValue: certifiedValue.toFixed(3),
    remainingValue: contractValue.minus(approvedValue).toFixed(3),
    progressPercent: percent(approvedValue, contractValue),
    executedPercent: percent(executedValue, contractValue),
    itemCount: items.length,
  };
}

export interface ProjectSummary extends BoqProgress {
  wirCounts: Record<string, number>;
  drToday: number;
  expensesApproved: string;
  expensesPending: string;
  pendingItems: number;
}

export async function getProjectSummary(ctx: Ctx, projectId: string): Promise<ProjectSummary> {
  const progress = await computeProjectProgress(ctx, projectId);
  const [wirCounts, drCounts, expenseRows] = await Promise.all([
    ctx.db
      .select({ status: wir.status, n: sql<number>`count(*)::int` })
      .from(wir)
      .where(eq(wir.project_id, projectId))
      .groupBy(wir.status),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(dailyReports)
      .where(
        and(
          eq(dailyReports.project_id, projectId),
          eq(dailyReports.report_date, new Date().toISOString().slice(0, 10)),
        ),
      ),
    ctx.db
      .select({
        status: expenses.status,
        total: sql<string>`coalesce(sum(${expenses.total}), '0')`,
      })
      .from(expenses)
      .where(eq(expenses.project_id, projectId))
      .groupBy(expenses.status),
  ]);

  const wc: Record<string, number> = {};
  for (const r of wirCounts) wc[r.status] = r.n;
  const er: Record<string, string> = {};
  for (const r of expenseRows) er[r.status] = r.total;

  const pendingItems =
    (wc.submitted ?? 0) +
    (drCounts[0]?.n ?? 0) +
    (await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(expenses)
      .where(and(eq(expenses.project_id, projectId), eq(expenses.status, "submitted")))
      .then((r) => r[0]?.n ?? 0));

  return {
    ...progress,
    wirCounts: wc,
    drToday: drCounts[0]?.n ?? 0,
    expensesApproved: er.approved ?? "0",
    expensesPending: er.submitted ?? "0",
    pendingItems,
  };
}

export function nextWirNumber(existing: string[]): string {
  return nextNumber(existing, "WIR", 3);
}

export async function unusedProjectCode(ctx: Ctx, code: string): Promise<boolean> {
  const rows = await ctx.db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.code, code.toUpperCase()))
    .limit(1);
  return rows.length === 0;
}

export async function projectsByIds(ctx: Ctx, ids: string[]) {
  if (!ids.length) return [];
  return ctx.db.select().from(projects).where(inArray(projects.id, ids));
}
