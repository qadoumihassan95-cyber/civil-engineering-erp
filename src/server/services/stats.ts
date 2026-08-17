import { and, desc, eq, inArray, sql, type AnyColumn } from "drizzle-orm";
import { projects, wir, dailyReports, expenses, adjustments, auditLogs } from "@/db/schema";
import type { Ctx } from "./ctx";
import { listVisibleProjects, computeProjectProgress } from "./projects";
import { lowStockAlerts } from "./inventory";
import { isGlobalProjectRole } from "@/server/auth/context";
import { d } from "@/server/lib/decimal";

export async function dashboardStats(ctx: Ctx) {
  const visible = await listVisibleProjects(ctx);
  const active = visible.filter((p) => p.status === "active" || p.status === "planning");
  const ids = visible.map((p) => p.id);

  let overallProgress = "0";
  if (active.length) {
    const per = await Promise.all(
      active.map(async (p) => ({
        weight: d(p.contract_value),
        progress: d((await computeProjectProgress(ctx, p.id)).progressPercent),
      })),
    );
    const totalWeight = per.reduce((acc, x) => acc.plus(x.weight), d(0));
    if (!totalWeight.isZero()) {
      const weighted = per.reduce((acc, x) => acc.plus(x.progress.times(x.weight)), d(0));
      overallProgress = weighted.div(totalWeight).toDecimalPlaces(2).toString();
    }
  }

  const scoped = (col: AnyColumn) =>
    ids.length ? inArray(col, ids) : sql`false`;

  const [pendingWirs, rejectedWirs, pendingReports, pendingExpenses, pendingAdjustments, todayReports] = await Promise.all([
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(wir)
      .where(and(eq(wir.status, "submitted"), scoped(wir.project_id)))
      .then((r) => r[0]?.n ?? 0),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(wir)
      .where(and(sql`${wir.status} in ('rejected','returned')`, scoped(wir.project_id)))
      .then((r) => r[0]?.n ?? 0),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(dailyReports)
      .where(and(eq(dailyReports.status, "submitted"), scoped(dailyReports.project_id)))
      .then((r) => r[0]?.n ?? 0),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(expenses)
      .where(and(eq(expenses.status, "submitted"), scoped(expenses.project_id)))
      .then((r) => r[0]?.n ?? 0),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(adjustments)
      .where(and(eq(adjustments.status, "submitted"), scoped(adjustments.project_id)))
      .then((r) => r[0]?.n ?? 0),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(dailyReports)
      .where(
        and(
          eq(dailyReports.report_date, new Date().toISOString().slice(0, 10)),
          scoped(dailyReports.project_id),
        ),
      )
      .then((r) => r[0]?.n ?? 0),
  ]);

  const [lowStock, recentActivity, expenseTotals, scheduleConcerns] = await Promise.all([
    lowStockAlerts(ctx),
    ctx.db
      .select()
      .from(auditLogs)
      .where(ids.length ? inArray(auditLogs.project_id, ids) : sql`false`)
      .orderBy(desc(auditLogs.created_at))
      .limit(12),
    ctx.db
      .select({
        total: sql<string>`coalesce(sum(${expenses.total}), '0')`,
        month: sql<string>`coalesce(sum(case when ${expenses.expense_date} >= date_trunc('month', now())::date then ${expenses.total} end), '0')`,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.status, "approved"),
          ids.length ? inArray(expenses.project_id, ids) : sql`false`,
        ),
      ),
    ctx.db
      .select({
        id: projects.id,
        code: projects.code,
        name: projects.name,
        planned_end_date: projects.planned_end_date,
        status: projects.status,
      })
      .from(projects)
      .where(
        and(
          sql`${projects.status} in ('active','planning')`,
          sql`${projects.planned_end_date} is not null`,
          ids.length ? inArray(projects.id, ids) : sql`false`,
        ),
      ),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const concerns = scheduleConcerns
    .filter((p) => p.planned_end_date && p.planned_end_date <= today)
    .map((p) => ({ ...p, overdue: true }));

  return {
    activeProjects: active.length,
    totalProjects: visible.length,
    overallProgress,
    pendingWirs,
    rejectedWirs,
    pendingReports,
    pendingExpenses,
    pendingAdjustments,
    todayReports,
    lowStock: lowStock.slice(0, 8),
    lowStockCount: lowStock.length,
    recentActivity,
    expensesTotal: expenseTotals[0]?.total ?? "0",
    expensesThisMonth: expenseTotals[0]?.month ?? "0",
    scheduleConcerns: concerns,
    visibleProjectIds: ids,
  };
}

export async function approvalQueue(ctx: Ctx) {
  const ids = isGlobalProjectRole(ctx.actor.role)
    ? null
    : await ctx.db
        .select({ id: sql<string>`project_id::text` })
        .from(sql`project_members`)
        .where(sql`user_id = ${ctx.actor.id}`)
        .then((r) => r.map((x) => x.id));

  const scoped = (col: AnyColumn) => (ids ? inArray(col, ids) : sql`true`);

  const [wirs, reports, exp, adjs] = await Promise.all([
    ctx.db
      .select({
        id: wir.id,
        entity: sql<string>`'wir'`,
        number: wir.number,
        project_id: wir.project_id,
        submitted_at: wir.submitted_at,
        by: sql<string>`(select name from users u where u.id = ${wir.engineer_id})`,
        project_code: sql<string>`(select code from projects p where p.id = ${wir.project_id})`,
        project_name: sql<string>`(select name from projects p where p.id = ${wir.project_id})`,
      })
      .from(wir)
      .where(and(eq(wir.status, "submitted"), scoped(wir.project_id)))
      .limit(20),
    ctx.db
      .select({
        id: dailyReports.id,
        entity: sql<string>`'daily_report'`,
        number: sql<string>`${dailyReports.report_date}`,
        project_id: dailyReports.project_id,
        submitted_at: dailyReports.submitted_at,
        by: sql<string | null>`(select name from users u where u.id = ${dailyReports.submitted_by})`,
        project_code: sql<string>`(select code from projects p where p.id = ${dailyReports.project_id})`,
        project_name: sql<string>`(select name from projects p where p.id = ${dailyReports.project_id})`,
      })
      .from(dailyReports)
      .where(and(eq(dailyReports.status, "submitted"), scoped(dailyReports.project_id)))
      .limit(20),
    ctx.db
      .select({
        id: expenses.id,
        entity: sql<string>`'expense'`,
        number: expenses.number,
        project_id: expenses.project_id,
        submitted_at: expenses.submitted_at,
        by: sql<string | null>`(select name from users u where u.id = ${expenses.created_by})`,
        project_code: sql<string>`(select code from projects p where p.id = ${expenses.project_id})`,
        project_name: sql<string>`(select name from projects p where p.id = ${expenses.project_id})`,
      })
      .from(expenses)
      .where(and(eq(expenses.status, "submitted"), scoped(expenses.project_id)))
      .limit(20),
    ctx.db
      .select({
        id: adjustments.id,
        entity: sql<string>`'adjustment'`,
        number: adjustments.number,
        project_id: adjustments.project_id,
        submitted_at: adjustments.submitted_at,
        by: sql<string | null>`(select name from users u where u.id = ${adjustments.created_by})`,
        project_code: sql<string | null>`(select code from projects p where p.id = ${adjustments.project_id})`,
        project_name: sql<string | null>`(select name from projects p where p.id = ${adjustments.project_id})`,
      })
      .from(adjustments)
      .where(and(eq(adjustments.status, "submitted"), scoped(adjustments.project_id)))
      .limit(20),
  ]);

  return [...wirs, ...reports, ...exp, ...adjs]
    .sort((a, b) => (a.submitted_at ?? "").localeCompare(b.submitted_at ?? ""))
    .slice(0, 30);
}

export async function projectKpis(ctx: Ctx, projectId: string) {
  const progress = await computeProjectProgress(ctx, projectId);
  const [wirCounts, drCounts, stockValue, expensesByStatus] = await Promise.all([
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
          sql`${dailyReports.report_date} >= now()::date - 7`,
        ),
      ),
    ctx.db
      .select({
        value: sql<string>`coalesce(sum(t.qty * coalesce((
          select t2.unit_cost from stock_transactions t2
          where t2.material_id = t.material_id and t2.txn_type = 'receipt' and t2.unit_cost is not null
          order by t2.created_at desc limit 1), 0)), '0')`,
      })
      .from(sql`stock_transactions t`)
      .where(sql`t.project_id = ${projectId}`)
      .groupBy(sql`t.material_id`),
    ctx.db
      .select({ status: expenses.status, total: sql<string>`coalesce(sum(${expenses.total}), '0')` })
      .from(expenses)
      .where(eq(expenses.project_id, projectId))
      .groupBy(expenses.status),
  ]);

  const wc: Record<string, number> = {};
  for (const r of wirCounts) wc[r.status] = r.n;
  const es: Record<string, string> = {};
  for (const r of expensesByStatus) es[r.status] = r.total;
  const stock = stockValue.reduce((acc, r) => acc.plus(d(r.value)), d(0));

  return {
    progress,
    wirCounts: wc,
    reportsLast7Days: drCounts[0]?.n ?? 0,
    stockValue: stock.toFixed(3),
    expensesByStatus: es,
    pendingApprovals:
      (wc.submitted ?? 0) +
      (es.submitted ? 1 : 0),
  };
}
