import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { expenses, expenseCategories, entityFiles, files } from "@/db/schema";
import type { Ctx } from "./ctx";
import { withNumberRetry } from "./ctx";
import { audit } from "./audit";
import { AppError, notFound, validation } from "@/server/lib/errors";
import { requirePermission, requireProjectPermission, hasProjectAccess, isGlobalProjectRole } from "@/server/auth/context";
import { add as dAdd } from "@/server/lib/decimal";
import { newId } from "@/server/lib/ids";

export const expenseSchema = z.object({
  project_id: z.string().uuid(),
  category_id: z.string().uuid().optional().nullable(),
  supplier_id: z.string().uuid().optional().nullable(),
  supplier_name: z.string().max(200).optional().nullable(),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.string().regex(/^\d+(\.\d{1,3})?$/),
  tax_amount: z.string().regex(/^\d+(\.\d{1,3})?$/).default("0"),
  currency: z.string().length(3).default("JOD"),
  payment_method: z.enum(["cash", "bank_transfer", "cheque", "card"]),
  reference_no: z.string().max(60).optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
  file_ids: z.array(z.string().uuid()).default([]),
});

export async function listExpenses(
  ctx: Ctx,
  opts: { projectId?: string; status?: string; from?: string; to?: string; search?: string; page?: number; pageSize?: number } = {},
) {
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 25, 100);
  const conds = [];

  if (!isGlobalProjectRole(ctx.actor.role) && !hasPermissionForFinance(ctx.actor.role)) {
    // role without expense visibility is denied outright
    throw new AppError("FORBIDDEN", "You cannot view expenses", { i18nKey: "errors.forbidden" });
  }

  if (opts.projectId) {
    conds.push(eq(expenses.project_id, opts.projectId));
    if (!isGlobalProjectRole(ctx.actor.role) && !(await hasProjectAccess(ctx.actor, opts.projectId))) {
      throw new AppError("FORBIDDEN", "You do not have access to this project", {
        i18nKey: "errors.forbidden",
      });
    }
  } else if (!isGlobalProjectRole(ctx.actor.role)) {
    const membership = await ctx.db.execute(
      sql`select project_id from project_members where user_id = ${ctx.actor.id}`,
    );
    const ids = (membership as unknown as { project_id: string }[]).map((r) => r.project_id);
    if (!ids.length) conds.push(sql`false`);
    else conds.push(inArray(expenses.project_id, ids));
  }

  if (opts.status) conds.push(eq(expenses.status, opts.status as never));
  if (opts.from) conds.push(sql`${expenses.expense_date} >= ${opts.from}`);
  if (opts.to) conds.push(sql`${expenses.expense_date} <= ${opts.to}`);
  if (opts.search && opts.search.trim()) {
    const s = `%${opts.search.trim()}%`;
    conds.push(
      sql`(${expenses.number} ilike ${s} or ${expenses.supplier_name} ilike ${s} or ${expenses.description} ilike ${s})`,
    );
  }
  const where = conds.length ? and(...conds) : undefined;

  const [rows, total] = await Promise.all([
    ctx.db
      .select({
        id: expenses.id,
        project_id: expenses.project_id,
        number: expenses.number,
        expense_date: expenses.expense_date,
        amount: expenses.amount,
        tax_amount: expenses.tax_amount,
        total: expenses.total,
        currency: expenses.currency,
        payment_method: expenses.payment_method,
        supplier_name: expenses.supplier_name,
        reference_no: expenses.reference_no,
        description: expenses.description,
        status: expenses.status,
        approved_at: expenses.approved_at,
        created_by: expenses.created_by,
        project_code: sql<string>`(select code from projects p where p.id = ${expenses.project_id})`,
        project_name: sql<string>`(select name from projects p where p.id = ${expenses.project_id})`,
        category_name: sql<string | null>`(select name from expense_categories c where c.id = ${expenses.category_id})`,
        creator_name: sql<string | null>`(select name from users u where u.id = ${expenses.created_by})`,
        approver_name: sql<string | null>`(select name from users u where u.id = ${expenses.approved_by})`,
      })
      .from(expenses)
      .where(where)
      .orderBy(desc(expenses.expense_date))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(expenses)
      .where(where),
  ]);

  const totals = await ctx.db
    .select({
      status: expenses.status,
      total: sql<string>`coalesce(sum(${expenses.total}), '0')`,
    })
    .from(expenses)
    .where(where)
    .groupBy(expenses.status);

  return { rows, total: total[0]?.n ?? 0, page, pageSize, totals };
}

function hasPermissionForFinance(role: string): boolean {
  return ["site_engineer", "project_manager", "accountant", "general_manager", "owner", "super_admin", "auditor", "quantity_surveyor"].includes(role);
}

export async function getExpense(ctx: Ctx, id: string) {
  const [row] = await ctx.db
    .select({
      id: expenses.id,
      project_id: expenses.project_id,
      number: expenses.number,
      category_id: expenses.category_id,
      supplier_id: expenses.supplier_id,
      supplier_name: expenses.supplier_name,
      expense_date: expenses.expense_date,
      amount: expenses.amount,
      tax_amount: expenses.tax_amount,
      total: expenses.total,
      currency: expenses.currency,
      payment_method: expenses.payment_method,
      reference_no: expenses.reference_no,
      description: expenses.description,
      status: expenses.status,
      created_by: expenses.created_by,
      submitted_at: expenses.submitted_at,
      approved_by: expenses.approved_by,
      approved_at: expenses.approved_at,
      review_comment: expenses.review_comment,
      created_at: expenses.created_at,
      project_code: sql<string>`(select code from projects p where p.id = ${expenses.project_id})`,
      project_name: sql<string>`(select name from projects p where p.id = ${expenses.project_id})`,
      category_name: sql<string | null>`(select name from expense_categories c where c.id = ${expenses.category_id})`,
      creator_name: sql<string | null>`(select name from users u where u.id = ${expenses.created_by})`,
      approver_name: sql<string | null>`(select name from users u where u.id = ${expenses.approved_by})`,
    })
    .from(expenses)
    .where(eq(expenses.id, id))
    .limit(1);
  if (!row) notFound("Expense");
  if (!isGlobalProjectRole(ctx.actor.role) && !(await hasProjectAccess(ctx.actor, row.project_id))) {
    throw new AppError("FORBIDDEN", "You do not have access to this project", {
      i18nKey: "errors.forbidden",
    });
  }
  const attachments = await ctx.db
    .select({ id: files.id, name: files.name, mime: files.mime, size: files.size })
    .from(entityFiles)
    .innerJoin(files, eq(files.id, entityFiles.file_id))
    .where(and(eq(entityFiles.entity_type, "expense"), eq(entityFiles.entity_id, id)));
  return { ...row, attachments };
}

export async function createExpense(ctx: Ctx, input: z.infer<typeof expenseSchema>) {
  await requireProjectPermission(ctx.actor, input.project_id, "expense:create");
  const data = expenseSchema.parse(input);
  const total = dAdd(data.amount, data.tax_amount);
  return withNumberRetry(ctx, async (db) => {
    const ctxTx = { ...ctx, db: db as never };
    const rows = await db
      .select({ number: expenses.number })
      .from(expenses)
      .where(eq(expenses.project_id, data.project_id));
    let max = 0;
    for (const r of rows) {
      const m = /^EXP-(\d+)$/.exec(r.number);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    const number = `EXP-${String(max + 1).padStart(4, "0")}`;
    const id = newId();
    await db.insert(expenses).values({
      id,
      project_id: data.project_id,
      number,
      category_id: data.category_id ?? null,
      supplier_id: data.supplier_id ?? null,
      supplier_name: data.supplier_name ?? null,
      expense_date: data.expense_date,
      amount: data.amount,
      tax_amount: data.tax_amount,
      total,
      currency: data.currency,
      payment_method: data.payment_method,
      reference_no: data.reference_no ?? null,
      description: data.description ?? null,
      status: "draft",
      created_by: ctx.actor.id,
    });
    if (data.file_ids.length) {
      await db.insert(entityFiles).values(
        data.file_ids.map((fid) => ({ entity_type: "expense", entity_id: id, file_id: fid, label: "receipt" })),
      );
    }
    await audit(ctxTx, {
      action: "created",
      entityType: "expense",
      entityId: id,
      projectId: data.project_id,
      after: { number, amount: data.amount, tax: data.tax_amount, total },
    });
    return { id, number };
  });
}

export async function submitExpense(ctx: Ctx, id: string, _comment?: string | null) {
  const [row] = await ctx.db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  if (!row) notFound("Expense");
  await requireProjectPermission(ctx.actor, row.project_id, "expense:create");
  if (row.status !== "draft") {
    throw new AppError("INVALID_STATE", "Only draft expenses can be submitted", {
      i18nKey: "errors.invalidTransition",
    });
  }
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(expenses)
      .set({ status: "submitted", submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .where(eq(expenses.id, id));
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "submitted",
      entityType: "expense",
      entityId: id,
      projectId: row.project_id,
      before: { status: row.status },
      after: { status: "submitted" },
    });
  });
}

export async function decideExpense(
  ctx: Ctx,
  id: string,
  input: { decision: "approved" | "rejected"; comment?: string | null },
) {
  const [row] = await ctx.db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  if (!row) notFound("Expense");
  await requireProjectPermission(ctx.actor, row.project_id, "expense:approve");
  if (input.decision === "rejected" && !input.comment?.trim()) {
    validation("A comment is required when rejecting", { i18nKey: "errors.validation" });
  }
  if (row.status !== "submitted") {
    throw new AppError("INVALID_STATE", "Only submitted expenses can be reviewed", {
      i18nKey: "errors.invalidTransition",
    });
  }
  if (row.created_by === ctx.actor.id && ctx.actor.role !== "super_admin") {
    throw new AppError(
      "SEPARATION_OF_DUTIES",
      "You cannot approve an expense you created. A different approver is required.",
      { i18nKey: "errors.selfApproval" },
    );
  }
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(expenses)
      .set({
        status: input.decision,
        approved_by: ctx.actor.id,
        approved_at: new Date().toISOString(),
        review_comment: input.comment ?? null,
        updated_at: new Date().toISOString(),
      })
      .where(eq(expenses.id, id));
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: input.decision,
      entityType: "expense",
      entityId: id,
      projectId: row.project_id,
      before: { status: "submitted" },
      after: { status: input.decision },
    });
  });
}

export async function updateExpenseDraft(ctx: Ctx, id: string, input: z.infer<typeof expenseSchema>) {
  const [row] = await ctx.db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  if (!row) notFound("Expense");
  await requireProjectPermission(ctx.actor, row.project_id, "expense:create");
  const data = expenseSchema.parse(input);
  if (row.status !== "draft") {
    throw new AppError("INVALID_STATE", "Only draft expenses can be edited", {
      i18nKey: "errors.invalidTransition",
    });
  }
  const total = dAdd(data.amount, data.tax_amount);
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(expenses)
      .set({
        project_id: data.project_id,
        category_id: data.category_id ?? null,
        supplier_id: data.supplier_id ?? null,
        supplier_name: data.supplier_name ?? null,
        expense_date: data.expense_date,
        amount: data.amount,
        tax_amount: data.tax_amount,
        total,
        currency: data.currency,
        payment_method: data.payment_method,
        reference_no: data.reference_no ?? null,
        description: data.description ?? null,
        updated_at: new Date().toISOString(),
      })
      .where(eq(expenses.id, id));
    if (data.file_ids !== undefined) {
      await tx.delete(entityFiles).where(and(eq(entityFiles.entity_type, "expense"), eq(entityFiles.entity_id, id)));
      if (data.file_ids.length) {
        await tx.insert(entityFiles).values(
          data.file_ids.map((fid) => ({ entity_type: "expense", entity_id: id, file_id: fid, label: "receipt" })),
        );
      }
    }
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "updated",
      entityType: "expense",
      entityId: id,
      projectId: row.project_id,
      before: { amount: row.amount, total: row.total },
      after: { amount: data.amount, total },
    });
  });
}

export async function deleteExpenseDraft(ctx: Ctx, id: string) {
  const [row] = await ctx.db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  if (!row) notFound("Expense");
  await requireProjectPermission(ctx.actor, row.project_id, "expense:create");
  if (row.status !== "draft") {
    throw new AppError("INVALID_STATE", "Only draft expenses can be deleted", {
      i18nKey: "errors.invalidTransition",
    });
  }
  await ctx.db.transaction(async (tx) => {
    await tx.delete(entityFiles).where(and(eq(entityFiles.entity_type, "expense"), eq(entityFiles.entity_id, id)));
    await tx.delete(expenses).where(eq(expenses.id, id));
    await audit({ db: tx as never, actor: ctx.actor }, {
      action: "deleted",
      entityType: "expense",
      entityId: id,
      projectId: row.project_id,
      before: { number: row.number },
    });
  });
}

export async function listExpenseCategories(ctx: Ctx) {
  return ctx.db.select().from(expenseCategories).orderBy(expenseCategories.name);
}

export async function createExpenseCategory(ctx: Ctx, input: { name: string; name_ar?: string | null }) {
  requirePermission(ctx.actor, "expense:create");
  const id = newId();
  await ctx.db.insert(expenseCategories).values({ id, name: input.name, name_ar: input.name_ar ?? null });
  return { id };
}

export async function expenseTotalsForProjects(ctx: Ctx, projectIds: string[]) {
  if (!projectIds.length) return [];
  return ctx.db
    .select({
      project_id: expenses.project_id,
      status: expenses.status,
      total: sql<string>`coalesce(sum(${expenses.total}), '0')`,
    })
    .from(expenses)
    .where(inArray(expenses.project_id, projectIds))
    .groupBy(expenses.project_id, expenses.status);
}
