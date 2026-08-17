import { cookies } from "next/headers";
import Link from "next/link";
import { getDb } from "@/db";
import { dashboardStats, approvalQueue } from "@/server/services/stats";
import { getAuthUser } from "@/server/auth/context";
import { getT, formatNumber, formatMoney, formatDateTime } from "@/server/i18n";
import { Stat, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/surfaces";
import { StatusBadge } from "@/components/ui/status";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = (await getAuthUser())!;
  const store = await cookies();
  const locale = store.get("locale")?.value === "ar" ? "ar" : "en";
  const t = getT(locale);
  const ctx = { db: getDb().db, actor: user };
  const [stats, queue] = await Promise.all([dashboardStats(ctx), approvalQueue(ctx)]);

  const fmtQty = (v: string) => formatNumber(v, locale, { maximumFractionDigits: 4 });
  const fmtMoney = (v: string) => formatMoney(v, locale);

  return (
    <div>
      <PageHeader title={t("dashboard.title")} subtitle={t("dashboard.kpiTraceHint")} />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label={t("dashboard.activeProjects")} value={stats.activeProjects} hint={t("dashboard.totalProjects", { count: stats.totalProjects })} />
        <Stat label={t("dashboard.overallProgress")} value={`${stats.overallProgress}%`} tone="info" />
        <Stat label={t("dashboard.pendingWirs")} value={stats.pendingWirs} tone={stats.pendingWirs ? "warning" : "default"} />
        <Stat label={t("dashboard.rejectedWirs")} value={stats.rejectedWirs} tone={stats.rejectedWirs ? "danger" : "default"} />
        <Stat
          label={t("dashboard.pendingApprovals")}
          value={stats.pendingWirs + stats.pendingReports + stats.pendingExpenses + stats.pendingAdjustments}
          tone={stats.pendingWirs + stats.pendingReports + stats.pendingExpenses + stats.pendingAdjustments ? "warning" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader title={t("dashboard.approvalQueue")} />
            {queue.length === 0 ? (
              <EmptyState title={t("common.emptyState")} />
            ) : (
              <div className="divide-y divide-slate-100">
                {queue.slice(0, 10).map((item, i) => {
                  const isWir = item.entity === "wir";
                  const isReport = item.entity === "daily_report";
                  const isExpense = item.entity === "expense";
                  const _isAdjustment = item.entity === "adjustment";
                  const href = isWir
                    ? `/wir/${item.id}`
                    : isReport
                      ? `/daily-reports/${item.id}`
                      : isExpense
                        ? `/expenses?open=${item.id}`
                        : `/inventory/adjustments?open=${item.id}`;
                  return (
                    <Link key={i} href={href} className="flex items-center justify-between gap-3 px-2 py-2.5 hover:bg-slate-50">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800">{item.number}</span>
                          <StatusBadge kind={isWir ? "wir" : isReport ? "daily_report" : isExpense ? "expense" : "adjustment"} status="submitted" />
                        </div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">
                          {item.project_code} — {item.project_name}
                        </div>
                      </div>
                      <div className="shrink-0 text-end text-xs text-slate-500">
                        <div>{item.by ?? "—"}</div>
                        <div className="mt-0.5 text-slate-400">{formatDateTime(item.submitted_at, locale)}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title={t("dashboard.recentMovements")}
              actions={
                <Link href="/projects" className="text-xs font-semibold text-primary-600 hover:underline">
                  {t("dashboard.viewAll")}
                </Link>
              }
            />
            {stats.recentActivity.length === 0 ? (
              <EmptyState title={t("common.emptyState")} />
            ) : (
              <div className="divide-y divide-slate-100">
                {stats.recentActivity.slice(0, 8).map((a) => (
                  <div key={a.id} className="flex items-center justify-between px-2 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium text-slate-700">{a.entity_type}</span>
                      <span className="ms-2 text-xs text-slate-500">
                        {a.action} · {a.actor_name}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{formatDateTime(a.created_at, locale)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t("dashboard.lowStock")} />
            {stats.lowStock.length === 0 ? (
              <EmptyState title={t("common.emptyState")} />
            ) : (
              <div className="space-y-2">
                {stats.lowStock.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-md bg-amber-50 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-amber-900">{s.name}</div>
                      <div className="text-[11px] text-amber-700">{s.code}</div>
                    </div>
                    <div className="text-end">
                      <div className="text-sm font-bold text-amber-900">{fmtQty(s.on_hand)}</div>
                      <div className="text-[11px] text-amber-700">
                        {t("inventory.minStock")}: {fmtQty(s.min_stock)} {s.unit}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title={t("dashboard.projectExpenses")} />
            <div className="mb-2 text-2xl font-bold text-slate-900">{fmtMoney(stats.expensesTotal)}</div>
            <div className="text-xs text-slate-500">
              {t("dashboard.expenseThisMonth")}: {fmtMoney(stats.expensesThisMonth)}
            </div>
          </Card>

          <Card>
            <CardHeader title={t("dashboard.scheduleConcerns")} />
            {stats.scheduleConcerns.length === 0 ? (
              <EmptyState title={t("common.emptyState")} />
            ) : (
              <div className="space-y-2">
                {stats.scheduleConcerns.map((p) => (
                  <Link key={p.id} href={`/projects/${p.id}`} className="block rounded-md bg-rose-50 px-3 py-2 hover:bg-rose-100">
                    <div className="text-sm font-medium text-rose-900">{p.name}</div>
                    <div className="text-[11px] text-rose-700">
                      {t("projects.plannedEnd")}: {p.planned_end_date}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title={t("dashboard.todayReports")} />
            <div className="text-2xl font-bold text-slate-900">{stats.todayReports}</div>
          </Card>
        </div>
      </div>
    </div>
  );
}
